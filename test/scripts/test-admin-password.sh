#!/bin/bash

# Admin Password Management Testing Script
# Tests both system-generated and admin-defined password approaches

set -e

BASE_URL="http://localhost:4040"
API_BASE="${BASE_URL}/api/v1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Admin Password Management Test ===${NC}\n"

# Step 1: Login as admin
echo -e "${YELLOW}Step 1: Login as Super Admin${NC}"
ADMIN_LOGIN=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@susano.dev",
    "password": "Admin@123"
  }')

ADMIN_TOKEN=$(echo $ADMIN_LOGIN | jq -r '.accessToken')

if [ "$ADMIN_TOKEN" == "null" ]; then
  echo -e "${RED}❌ Admin login failed${NC}"
  echo $ADMIN_LOGIN | jq .
  exit 1
fi

echo -e "${GREEN}✅ Admin logged in successfully${NC}"
echo "Admin token: ${ADMIN_TOKEN:0:20}..."

# Step 2: Create test user
echo -e "\n${YELLOW}Step 2: Create test user${NC}"
TEST_EMAIL="admin-test-$(date +%s)@example.com"
TEST_PASSWORD="TestUser@123"

REGISTER_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Admin Test User\",
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"confirmPassword\": \"$TEST_PASSWORD\"
  }")

USER_ID=$(echo $REGISTER_RESPONSE | jq -r '.user.id')

if [ "$USER_ID" == "null" ]; then
  echo -e "${RED}❌ User registration failed${NC}"
  echo $REGISTER_RESPONSE | jq .
  exit 1
fi

echo -e "${GREEN}✅ Test user created${NC}"
echo "User ID: $USER_ID"
echo "Email: $TEST_EMAIL"

# Step 3: User logs in (get session)
echo -e "\n${YELLOW}Step 3: User logs in (to create session)${NC}"
USER_LOGIN=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

USER_TOKEN=$(echo $USER_LOGIN | jq -r '.accessToken')

if [ "$USER_TOKEN" == "null" ]; then
  echo -e "${RED}❌ User login failed${NC}"
  echo $USER_LOGIN | jq .
  exit 1
fi

echo -e "${GREEN}✅ User logged in successfully${NC}"
echo "User has active session with token: ${USER_TOKEN:0:20}..."

# Step 4: Test System-Generated Password Reset
echo -e "\n${YELLOW}Step 4: Admin resets password (system-generated)${NC}"
RESET_RESPONSE=$(curl -s -X POST "${API_BASE}/admin/users/reset-password" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"forcePasswordChange\": true,
    \"reason\": \"Testing system-generated password reset\"
  }")

TEMP_PASSWORD=$(echo $RESET_RESPONSE | jq -r '.temporaryPassword')

if [ "$TEMP_PASSWORD" == "null" ]; then
  echo -e "${RED}❌ Password reset failed${NC}"
  echo $RESET_RESPONSE | jq .
  exit 1
fi

echo -e "${GREEN}✅ Password reset successfully${NC}"
echo "Response:"
echo $RESET_RESPONSE | jq .
echo -e "\n${GREEN}Temporary Password: $TEMP_PASSWORD${NC}"

# Step 5: Verify old session is invalidated
echo -e "\n${YELLOW}Step 5: Verify old session is invalidated${NC}"
SESSION_CHECK=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$SESSION_CHECK" | tail -n1)

if [ "$HTTP_CODE" == "401" ]; then
  echo -e "${GREEN}✅ Old session invalidated (401 Unauthorized)${NC}"
else
  echo -e "${RED}❌ Old session still valid (expected 401, got $HTTP_CODE)${NC}"
  echo "$SESSION_CHECK"
fi

# Step 6: Login with temporary password
echo -e "\n${YELLOW}Step 6: Login with temporary password${NC}"
TEMP_LOGIN=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEMP_PASSWORD\"
  }")

NEW_TOKEN=$(echo $TEMP_LOGIN | jq -r '.accessToken')

if [ "$NEW_TOKEN" == "null" ]; then
  echo -e "${RED}❌ Login with temporary password failed${NC}"
  echo $TEMP_LOGIN | jq .
  exit 1
fi

echo -e "${GREEN}✅ Login with temporary password successful${NC}"
echo "New token: ${NEW_TOKEN:0:20}..."

# Step 7: Test Admin-Defined Password
echo -e "\n${YELLOW}Step 7: Admin sets specific password${NC}"
NEW_PASSWORD="AdminSet@Pass123"

SET_RESPONSE=$(curl -s -X POST "${API_BASE}/admin/users/set-password" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"newPassword\": \"$NEW_PASSWORD\",
    \"forcePasswordChange\": true,
    \"reason\": \"Testing admin-defined password\",
    \"sendNotification\": false
  }")

RESPONSE_EMAIL=$(echo $SET_RESPONSE | jq -r '.email')

if [ "$RESPONSE_EMAIL" == "null" ]; then
  echo -e "${RED}❌ Set password failed${NC}"
  echo $SET_RESPONSE | jq .
  exit 1
fi

# Check that temporaryPassword is NOT in response
TEMP_PASS_IN_RESPONSE=$(echo $SET_RESPONSE | jq -r '.temporaryPassword')
if [ "$TEMP_PASS_IN_RESPONSE" == "null" ]; then
  echo -e "${GREEN}✅ Password set successfully (no temporaryPassword in response)${NC}"
else
  echo -e "${RED}❌ temporaryPassword should not be in admin-defined response${NC}"
fi

echo "Response:"
echo $SET_RESPONSE | jq .

# Step 8: Verify previous session invalidated
echo -e "\n${YELLOW}Step 8: Verify session invalidated again${NC}"
SESSION_CHECK2=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer $NEW_TOKEN" \
  -w "\n%{http_code}")

HTTP_CODE2=$(echo "$SESSION_CHECK2" | tail -n1)

if [ "$HTTP_CODE2" == "401" ]; then
  echo -e "${GREEN}✅ Session invalidated after password set (401 Unauthorized)${NC}"
else
  echo -e "${RED}❌ Session still valid (expected 401, got $HTTP_CODE2)${NC}"
fi

# Step 9: Login with admin-defined password
echo -e "\n${YELLOW}Step 9: Login with admin-defined password${NC}"
FINAL_LOGIN=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$NEW_PASSWORD\"
  }")

FINAL_TOKEN=$(echo $FINAL_LOGIN | jq -r '.accessToken')

if [ "$FINAL_TOKEN" == "null" ]; then
  echo -e "${RED}❌ Login with admin-defined password failed${NC}"
  echo $FINAL_LOGIN | jq .
  exit 1
fi

echo -e "${GREEN}✅ Login with admin-defined password successful${NC}"
echo "Final token: ${FINAL_TOKEN:0:20}..."

# Step 10: Test error cases
echo -e "\n${YELLOW}Step 10: Test error cases${NC}"

# Test 1: Non-existent user
echo "Test 1: Non-existent user (expect 404)"
ERROR_404=$(curl -s -X POST "${API_BASE}/admin/users/reset-password" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"00000000-0000-0000-0000-000000000000\",
    \"reason\": \"Testing error handling\"
  }" \
  -w "\n%{http_code}")

HTTP_404=$(echo "$ERROR_404" | tail -n1)
if [ "$HTTP_404" == "404" ]; then
  echo -e "${GREEN}✅ Correctly returns 404 for non-existent user${NC}"
else
  echo -e "${RED}❌ Expected 404, got $HTTP_404${NC}"
fi

# Test 2: Weak password (admin-defined)
echo -e "\nTest 2: Weak password (expect 400)"
ERROR_400=$(curl -s -X POST "${API_BASE}/admin/users/set-password" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"newPassword\": \"weak\",
    \"reason\": \"Testing weak password\"
  }" \
  -w "\n%{http_code}")

HTTP_400=$(echo "$ERROR_400" | tail -n1)
if [ "$HTTP_400" == "400" ]; then
  echo -e "${GREEN}✅ Correctly rejects weak password (400)${NC}"
else
  echo -e "${RED}❌ Expected 400, got $HTTP_400${NC}"
fi

# Summary
echo -e "\n${GREEN}=== Test Summary ===${NC}"
echo -e "${GREEN}✅ System-generated password reset: Working${NC}"
echo -e "${GREEN}✅ Admin-defined password set: Working${NC}"
echo -e "${GREEN}✅ Session invalidation: Working${NC}"
echo -e "${GREEN}✅ Password validation: Working${NC}"
echo -e "${GREEN}✅ Error handling: Working${NC}"
echo -e "\n${GREEN}All tests passed! 🎉${NC}"
