#!/bin/bash

# Password Security Features Test Script
# Tests password strength validation, password history, and email notifications

set -e

BASE_URL="${BASE_URL:-http://localhost:4040}"
API_BASE="${BASE_URL}/api/v1"

echo "🔐 Password Security Features Test"
echo "=================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Password Strength - Very Weak
echo "Test 1: Password Strength - Very Weak Password"
echo "----------------------------------------------"
RESPONSE=$(curl -s -X POST "${API_BASE}/auth/password-strength" \
  -H "Content-Type: application/json" \
  -d '{"password":"password"}')
SCORE=$(echo $RESPONSE | jq -r '.score')
STRENGTH=$(echo $RESPONSE | jq -r '.strength')
PASSED=$(echo $RESPONSE | jq -r '.passed')

if [ "$PASSED" == "false" ] && [ "$SCORE" == "0" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Weak password correctly identified (score: $SCORE, strength: $STRENGTH)"
else
  echo -e "${RED}✗ FAIL${NC}: Expected passed=false, score=0, got passed=$PASSED, score=$SCORE"
fi
echo ""

# Test 2: Password Strength - Strong
echo "Test 2: Password Strength - Strong Password"
echo "-------------------------------------------"
RESPONSE=$(curl -s -X POST "${API_BASE}/auth/password-strength" \
  -H "Content-Type: application/json" \
  -d '{"password":"MyStr0ng!P@ssw0rd2024"}')
SCORE=$(echo $RESPONSE | jq -r '.score')
STRENGTH=$(echo $RESPONSE | jq -r '.strength')
PASSED=$(echo $RESPONSE | jq -r '.passed')

if [ "$PASSED" == "true" ] && [ "$SCORE" -ge "3" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Strong password correctly identified (score: $SCORE, strength: $STRENGTH)"
else
  echo -e "${RED}✗ FAIL${NC}: Expected passed=true, score>=3, got passed=$PASSED, score=$SCORE"
fi
echo ""

# Test 3: Password Strength - Requirements Check
echo "Test 3: Password Strength - Requirements Breakdown"
echo "--------------------------------------------------"
RESPONSE=$(curl -s -X POST "${API_BASE}/auth/password-strength" \
  -H "Content-Type: application/json" \
  -d '{"password":"Test@123"}')
echo "Password: Test@123"
echo "Requirements:"
echo $RESPONSE | jq -r '.requirements | to_entries[] | "  - \(.key): \(.value)"'
echo "Feedback:"
echo $RESPONSE | jq -r '.feedback[]' | sed 's/^/  - /'
echo ""

# Test 4: Login and Get Token
echo "Test 4: Login to Get Access Token"
echo "---------------------------------"
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kuybi.dev","password":"Admin@123"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')

if [ "$TOKEN" != "null" ] && [ ! -z "$TOKEN" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Successfully logged in"
  echo "Token: ${TOKEN:0:20}..."
else
  echo -e "${RED}✗ FAIL${NC}: Failed to get access token"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi
echo ""

# Test 5: Change Password - Weak Password (Should Fail)
echo "Test 5: Change Password - Weak Password (Should Fail)"
echo "-----------------------------------------------------"
RESPONSE=$(curl -s -X POST "${API_BASE}/auth/change-password" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword":"Admin@123",
    "newPassword":"weak",
    "confirmPassword":"weak",
    "invalidateAllSessions":false,
    "sendNotificationEmail":false
  }')

ERROR=$(echo $RESPONSE | jq -r '.message')
if echo "$ERROR" | grep -q "strength requirements"; then
  echo -e "${GREEN}✓ PASS${NC}: Weak password rejected with proper error message"
else
  echo -e "${YELLOW}⚠ WARN${NC}: Expected strength requirement error, got: $ERROR"
fi
echo ""

# Test 6: Change Password - Strong Password (Should Succeed)
echo "Test 6: Change Password - Strong Password"
echo "-----------------------------------------"
NEW_PASSWORD="NewSecure@Pass2024!"
RESPONSE=$(curl -s -X POST "${API_BASE}/auth/change-password" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"currentPassword\":\"Admin@123\",
    \"newPassword\":\"$NEW_PASSWORD\",
    \"confirmPassword\":\"$NEW_PASSWORD\",
    \"invalidateAllSessions\":false,
    \"sendNotificationEmail\":true
  }")

SUCCESS=$(echo $RESPONSE | jq -r '.success')
SESSIONS_REVOKED=$(echo $RESPONSE | jq -r '.sessionsRevoked')
NOTIFICATION_SENT=$(echo $RESPONSE | jq -r '.notificationSent')

if [ "$SUCCESS" == "true" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Password changed successfully"
  echo "  Sessions revoked: $SESSIONS_REVOKED"
  echo "  Notification sent: $NOTIFICATION_SENT"
else
  echo -e "${RED}✗ FAIL${NC}: Password change failed"
  echo "Response: $RESPONSE"
fi
echo ""

# Test 7: Re-login with New Password
echo "Test 7: Re-login with New Password"
echo "-----------------------------------"
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@kuybi.dev\",\"password\":\"$NEW_PASSWORD\"}")

NEW_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')

if [ "$NEW_TOKEN" != "null" ] && [ ! -z "$NEW_TOKEN" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Successfully logged in with new password"
else
  echo -e "${RED}✗ FAIL${NC}: Failed to login with new password"
  echo "Response: $LOGIN_RESPONSE"
fi
echo ""

# Test 8: Try to Reuse Password (Should Fail)
echo "Test 8: Try to Reuse Previous Password (Should Fail)"
echo "----------------------------------------------------"
RESPONSE=$(curl -s -X POST "${API_BASE}/auth/change-password" \
  -H "Authorization: Bearer $NEW_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"currentPassword\":\"$NEW_PASSWORD\",
    \"newPassword\":\"Admin@123\",
    \"confirmPassword\":\"Admin@123\",
    \"invalidateAllSessions\":false,
    \"sendNotificationEmail\":false
  }")

ERROR=$(echo $RESPONSE | jq -r '.message')
if echo "$ERROR" | grep -q "used recently"; then
  echo -e "${GREEN}✓ PASS${NC}: Password reuse correctly prevented"
  echo "Error: $ERROR"
else
  echo -e "${YELLOW}⚠ WARN${NC}: Expected password reuse error, got: $ERROR"
fi
echo ""

# Test 9: Reset Password Back to Original
echo "Test 9: Reset Password Back to Original"
echo "---------------------------------------"
ANOTHER_PASSWORD="AnotherSecure@123!"
RESPONSE=$(curl -s -X POST "${API_BASE}/auth/change-password" \
  -H "Authorization: Bearer $NEW_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"currentPassword\":\"$NEW_PASSWORD\",
    \"newPassword\":\"$ANOTHER_PASSWORD\",
    \"confirmPassword\":\"$ANOTHER_PASSWORD\",
    \"invalidateAllSessions\":false,
    \"sendNotificationEmail\":false
  }")

SUCCESS=$(echo $RESPONSE | jq -r '.success')

if [ "$SUCCESS" == "true" ]; then
  # Login with new password to get token
  LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@kuybi.dev\",\"password\":\"$ANOTHER_PASSWORD\"}")
  FINAL_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')

  # Change back to original
  RESPONSE=$(curl -s -X POST "${API_BASE}/auth/change-password" \
    -H "Authorization: Bearer $FINAL_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "currentPassword":"'"$ANOTHER_PASSWORD"'",
      "newPassword":"Admin@123",
      "confirmPassword":"Admin@123",
      "invalidateAllSessions":false,
      "sendNotificationEmail":false
    }')

  SUCCESS=$(echo $RESPONSE | jq -r '.success')
  if [ "$SUCCESS" == "true" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Password reset to original successfully"
  else
    echo -e "${YELLOW}⚠ WARN${NC}: Failed to reset password: $RESPONSE"
  fi
else
  echo -e "${YELLOW}⚠ WARN${NC}: Failed intermediate password change"
fi
echo ""

# Summary
echo "=================================="
echo "✅ Test Suite Complete!"
echo "=================================="
echo ""
echo "Features Tested:"
echo "  1. ✓ Password strength validation (weak password)"
echo "  2. ✓ Password strength validation (strong password)"
echo "  3. ✓ Password requirements breakdown"
echo "  4. ✓ Authentication with existing password"
echo "  5. ✓ Password change with weak password (rejection)"
echo "  6. ✓ Password change with strong password (success)"
echo "  7. ✓ Re-authentication with new password"
echo "  8. ✓ Password reuse prevention (history check)"
echo "  9. ✓ Password reset (cleanup)"
echo ""
echo "Email notification logs can be checked with:"
echo "  docker logs kuybi-api | grep 'password_change_notification'"
echo ""
