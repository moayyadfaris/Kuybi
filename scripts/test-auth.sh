#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Kuybi Auth Testing Script ===${NC}\n"

# Check if token is provided
if [ -z "$1" ]; then
    echo -e "${RED}Usage: $0 <ACCESS_TOKEN>${NC}"
    echo "Example: $0 'eyJhbGc...'"
    exit 1
fi

TOKEN="$1"
BASE_URL="${2:-http://localhost:4000/api}"

echo -e "${YELLOW}1. Decoding JWT Token...${NC}"
node -e "
const token = '$TOKEN';
const parts = token.split('.');
if (parts.length !== 3) {
  console.log('❌ Invalid JWT format');
  process.exit(1);
}

try {
  const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  
  console.log('Header:', JSON.stringify(header, null, 2));
  console.log('\\nPayload:', JSON.stringify(payload, null, 2));
  console.log('\\n📅 Issued at:', new Date(payload.iat * 1000).toISOString());
  console.log('📅 Expires at:', new Date(payload.exp * 1000).toISOString());
  console.log('📅 Current time:', new Date().toISOString());
  
  const isExpired = payload.exp * 1000 < Date.now();
  if (isExpired) {
    console.log('\\n❌ Token is EXPIRED');
  } else {
    const remainingMinutes = Math.floor((payload.exp * 1000 - Date.now()) / 60000);
    console.log('\\n✅ Token is valid for', remainingMinutes, 'more minutes');
  }
} catch (e) {
  console.log('❌ Failed to decode:', e.message);
  process.exit(1);
}
"

echo -e "\n${YELLOW}2. Testing Authentication Endpoints...${NC}\n"

# Test protected endpoint
echo -e "${YELLOW}Testing /v1/users/me endpoint...${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/v1/users/me" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Authentication successful!${NC}"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
elif [ "$HTTP_CODE" = "401" ]; then
    echo -e "${RED}❌ 401 Unauthorized${NC}"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
    echo -e "\n${YELLOW}Possible causes:${NC}"
    echo "  1. Token was signed with different JWT_SECRET"
    echo "  2. Token is expired"
    echo "  3. Token is blacklisted (user logged out)"
    echo "  4. Token format is invalid"
else
    echo -e "${RED}❌ Unexpected status code: $HTTP_CODE${NC}"
    echo "$BODY"
fi

echo -e "\n${YELLOW}3. Testing Attachments Upload Endpoint...${NC}\n"

# Create a test file
TEST_FILE="/tmp/test-upload.txt"
echo "Test file content for upload" > "$TEST_FILE"

UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/v1/attachments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@${TEST_FILE}" \
  -F "category=test" \
  -F "isPublic=true")

UPLOAD_HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)
UPLOAD_BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')

if [ "$UPLOAD_HTTP_CODE" = "201" ] || [ "$UPLOAD_HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Upload successful!${NC}"
    echo "$UPLOAD_BODY" | python3 -m json.tool 2>/dev/null || echo "$UPLOAD_BODY"
elif [ "$UPLOAD_HTTP_CODE" = "401" ]; then
    echo -e "${RED}❌ 401 Unauthorized on upload${NC}"
    echo "$UPLOAD_BODY" | python3 -m json.tool 2>/dev/null || echo "$UPLOAD_BODY"
else
    echo -e "${YELLOW}⚠️  Status code: $UPLOAD_HTTP_CODE${NC}"
    echo "$UPLOAD_BODY"
fi

# Cleanup
rm -f "$TEST_FILE"

echo -e "\n${YELLOW}=== Test Complete ===${NC}"
