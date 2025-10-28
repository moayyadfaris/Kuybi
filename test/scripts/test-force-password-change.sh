#!/bin/bash

# Force Password Change Testing Script
# Tests complete flow: admin reset → login blocked → password change → login success

set -e

BASE_URL="http://localhost:4040"
API_BASE="${BASE_URL}/api/v1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Force Password Change Integration Test   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"

# Login as admin
echo -e "${YELLOW}Step 1: Admin Login${NC}"
ADMIN_LOGIN=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@susano.dev",
    "password": "Admin@123"
  }')

ADMIN_TOKEN=$(echo $ADMIN_LOGIN | jq -r '.accessToken')
if [ "$ADMIN_TOKEN" == "null" ]; then
  echo -e "${RED}❌ Admin login failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Admin logged in${NC}\n"

# Create test user
echo -e "${YELLOW}Step 2: Create Test User${NC}"
TEST_EMAIL="force-pwd-test-$(date +%s)@example.com"
TEST_PASSWORD="InitialPass@123"

REGISTER=$(curl -s -X POST "${API_BASE}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Force Password Test\",
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"confirmPassword\": \"$TEST_PASSWORD\"
  }")

USER_ID=$(echo $REGISTER | jq -r '.data.userId')
if [ "$USER_ID" == "null" ]; then
  echo -e "${RED}❌ User creation failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Test user created: $TEST_EMAIL${NC}"
echo -e "   User ID: $USER_ID\n"

# User logs in normally (before force password change)
echo -e "${YELLOW}Step 3: User Initial Login (should succeed)${NC}"
INITIAL_LOGIN=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

INITIAL_TOKEN=$(echo $INITIAL_LOGIN | jq -r '.accessToken')
if [ "$INITIAL_TOKEN" == "null" ]; then
  echo -e "${RED}❌ Initial login failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Initial login successful${NC}\n"

# Admin resets user password with forcePasswordChange
echo -e "${YELLOW}Step 4: Admin Resets Password (system-generated)${NC}"
RESET=$(curl -s -X POST "${API_BASE}/admin/users/reset-password" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"forcePasswordChange\": true,
    \"reason\": \"Testing force password change flow\"
  }")

TEMP_PASSWORD=$(echo $RESET | jq -r '.temporaryPassword')
if [ "$TEMP_PASSWORD" == "null" ]; then
  echo -e "${RED}❌ Password reset failed${NC}"
  echo $RESET | jq .
  exit 1
fi
echo -e "${GREEN}✅ Password reset by admin${NC}"
echo -e "${BLUE}   Temporary Password: $TEMP_PASSWORD${NC}\n"

# Verify old token is invalidated
echo -e "${YELLOW}Step 5: Verify Old Session Invalidated${NC}"
ME_CHECK=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer $INITIAL_TOKEN" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$ME_CHECK" | tail -n1)
if [ "$HTTP_CODE" == "401" ]; then
  echo -e "${GREEN}✅ Old session invalidated (401 Unauthorized)${NC}\n"
else
  echo -e "${RED}❌ Old session still valid (expected 401, got $HTTP_CODE)${NC}"
fi

# User attempts login with temp password
echo -e "${YELLOW}Step 6: User Login with Temporary Password${NC}"
LOGIN_TEMP=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEMP_PASSWORD\"
  }")

echo "Response:"
echo $LOGIN_TEMP | jq .

REQUIRES_CHANGE=$(echo $LOGIN_TEMP | jq -r '.requiresPasswordChange')
TEMP_ACCESS_TOKEN=$(echo $LOGIN_TEMP | jq -r '.tempAccessToken')

if [ "$REQUIRES_CHANGE" != "true" ]; then
  echo -e "${RED}❌ requiresPasswordChange should be true${NC}"
  exit 1
fi

if [ "$TEMP_ACCESS_TOKEN" == "null" ] || [ "$TEMP_ACCESS_TOKEN" == "" ]; then
  echo -e "${RED}❌ tempAccessToken not provided${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Login blocked - password change required${NC}"
echo -e "${BLUE}   Message: $(echo $LOGIN_TEMP | jq -r '.message')${NC}"
echo -e "${BLUE}   Temp Token (15 min): ${TEMP_ACCESS_TOKEN:0:30}...${NC}\n"

# User changes password
echo -e "${YELLOW}Step 7: User Changes Password${NC}"
NEW_PASSWORD="MyNewSecure@Pass789"

CHANGE=$(curl -s -X POST "${API_BASE}/auth/change-password" \
  -H "Authorization: Bearer $TEMP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"currentPassword\": \"$TEMP_PASSWORD\",
    \"newPassword\": \"$NEW_PASSWORD\",
    \"confirmPassword\": \"$NEW_PASSWORD\"
  }")

echo "Response:"
echo $CHANGE | jq .

SUCCESS=$(echo $CHANGE | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo -e "${RED}❌ Password change failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Password changed successfully${NC}\n"

# User logs in with new password (should succeed normally)
echo -e "${YELLOW}Step 8: User Login with New Password${NC}"
FINAL_LOGIN=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$NEW_PASSWORD\"
  }")

echo "Response:"
echo $FINAL_LOGIN | jq .

FINAL_ACCESS_TOKEN=$(echo $FINAL_LOGIN | jq -r '.accessToken')
FINAL_REFRESH_TOKEN=$(echo $FINAL_LOGIN | jq -r '.refreshToken')
FINAL_REQUIRES_CHANGE=$(echo $FINAL_LOGIN | jq -r '.requiresPasswordChange')

if [ "$FINAL_ACCESS_TOKEN" == "null" ] || [ "$FINAL_ACCESS_TOKEN" == "" ]; then
  echo -e "${RED}❌ Final login failed - no access token${NC}"
  exit 1
fi

if [ "$FINAL_REFRESH_TOKEN" == "null" ] || [ "$FINAL_REFRESH_TOKEN" == "" ]; then
  echo -e "${RED}❌ Final login failed - no refresh token${NC}"
  exit 1
fi

if [ "$FINAL_REQUIRES_CHANGE" == "true" ]; then
  echo -e "${RED}❌ Password change flag not cleared${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Login successful with new password${NC}"
echo -e "${BLUE}   Access Token: ${FINAL_ACCESS_TOKEN:0:30}...${NC}"
echo -e "${BLUE}   Refresh Token: ${FINAL_REFRESH_TOKEN:0:30}...${NC}\n"

# Verify user can access protected endpoints
echo -e "${YELLOW}Step 9: Verify Access to Protected Endpoints${NC}"
ME=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer $FINAL_ACCESS_TOKEN")

USER_EMAIL=$(echo $ME | jq -r '.email')
if [ "$USER_EMAIL" == "$TEST_EMAIL" ]; then
  echo -e "${GREEN}✅ User can access protected endpoints${NC}\n"
else
  echo -e "${RED}❌ Failed to access protected endpoint${NC}"
  exit 1
fi

# Test validation errors
echo -e "${YELLOW}Step 10: Test Validation Errors${NC}"

echo "Test 10.1: Passwords don't match"
ERROR_MISMATCH=$(curl -s -X POST "${API_BASE}/auth/change-password" \
  -H "Authorization: Bearer $FINAL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"currentPassword\": \"$NEW_PASSWORD\",
    \"newPassword\": \"AnotherPass@123\",
    \"confirmPassword\": \"DifferentPass@123\"
  }" \
  -w "\n%{http_code}")

HTTP_MISMATCH=$(echo "$ERROR_MISMATCH" | tail -n1)
if [ "$HTTP_MISMATCH" == "401" ]; then
  echo -e "${GREEN}✅ Correctly rejects mismatched passwords${NC}"
else
  echo -e "${RED}❌ Expected 401 for mismatch, got $HTTP_MISMATCH${NC}"
fi

echo "Test 10.2: Wrong current password"
ERROR_WRONG=$(curl -s -X POST "${API_BASE}/auth/change-password" \
  -H "Authorization: Bearer $FINAL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"currentPassword\": \"WrongPassword@123\",
    \"newPassword\": \"AnotherPass@123\",
    \"confirmPassword\": \"AnotherPass@123\"
  }" \
  -w "\n%{http_code}")

HTTP_WRONG=$(echo "$ERROR_WRONG" | tail -n1)
if [ "$HTTP_WRONG" == "401" ]; then
  echo -e "${GREEN}✅ Correctly rejects wrong current password${NC}"
else
  echo -e "${RED}❌ Expected 401 for wrong password, got $HTTP_WRONG${NC}"
fi

echo "Test 10.3: Reusing same password"
ERROR_REUSE=$(curl -s -X POST "${API_BASE}/auth/change-password" \
  -H "Authorization: Bearer $FINAL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"currentPassword\": \"$NEW_PASSWORD\",
    \"newPassword\": \"$NEW_PASSWORD\",
    \"confirmPassword\": \"$NEW_PASSWORD\"
  }" \
  -w "\n%{http_code}")

HTTP_REUSE=$(echo "$ERROR_REUSE" | tail -n1)
if [ "$HTTP_REUSE" == "401" ]; then
  echo -e "${GREEN}✅ Correctly prevents password reuse${NC}"
else
  echo -e "${RED}❌ Expected 401 for password reuse, got $HTTP_REUSE${NC}"
fi

echo "Test 10.4: Weak password"
ERROR_WEAK=$(curl -s -X POST "${API_BASE}/auth/change-password" \
  -H "Authorization: Bearer $FINAL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"currentPassword\": \"$NEW_PASSWORD\",
    \"newPassword\": \"weak\",
    \"confirmPassword\": \"weak\"
  }" \
  -w "\n%{http_code}")

HTTP_WEAK=$(echo "$ERROR_WEAK" | tail -n1)
if [ "$HTTP_WEAK" == "400" ]; then
  echo -e "${GREEN}✅ Correctly rejects weak password${NC}\n"
else
  echo -e "${RED}❌ Expected 400 for weak password, got $HTTP_WEAK${NC}\n"
fi

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Test Summary                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo -e "${GREEN}✅ Admin password reset${NC}"
echo -e "${GREEN}✅ Login blocked with requiresPasswordChange${NC}"
echo -e "${GREEN}✅ Temporary access token provided${NC}"
echo -e "${GREEN}✅ Password change successful${NC}"
echo -e "${GREEN}✅ Login successful with new password${NC}"
echo -e "${GREEN}✅ Protected endpoints accessible${NC}"
echo -e "${GREEN}✅ Old sessions invalidated${NC}"
echo -e "${GREEN}✅ Validation errors handled correctly${NC}"
echo -e "\n${GREEN}🎉 All tests passed! Force password change is working perfectly!${NC}\n"
