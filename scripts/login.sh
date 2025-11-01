#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="${1:-http://localhost:4000/api}"
EMAIL="${2:-admin@susano.dev}"
PASSWORD="${3:-Admin@123}"

echo -e "${YELLOW}=== Kuybi Login Helper ===${NC}\n"
echo "Logging in as: $EMAIL"
echo "Base URL: $BASE_URL"
echo ""

RESPONSE=$(curl -s -X POST "${BASE_URL}/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

# Check if response contains accessToken
if echo "$RESPONSE" | grep -q "accessToken"; then
    echo -e "${GREEN}✅ Login successful!${NC}\n"
    
    ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    REFRESH_TOKEN=$(echo "$RESPONSE" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
    
    echo "Full Response:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    
    echo -e "\n${YELLOW}=== Tokens ===${NC}"
    echo "Access Token:"
    echo "$ACCESS_TOKEN"
    echo ""
    echo "Refresh Token:"
    echo "$REFRESH_TOKEN"
    
    # Save to file
    echo "$ACCESS_TOKEN" > /tmp/kuybi-access-token.txt
    echo "$REFRESH_TOKEN" > /tmp/kuybi-refresh-token.txt
    
    echo -e "\n${GREEN}✅ Tokens saved to:${NC}"
    echo "  - /tmp/kuybi-access-token.txt"
    echo "  - /tmp/kuybi-refresh-token.txt"
    
    # Quick test
    echo -e "\n${YELLOW}=== Quick Test ===${NC}"
    echo "Testing with: ./scripts/test-auth.sh \"\$ACCESS_TOKEN\""
    echo ""
    
    # Export for current shell (won't work across scripts, but useful info)
    echo "To use in your terminal, run:"
    echo "export ACCESS_TOKEN=\"$ACCESS_TOKEN\""
    echo ""
    echo "Or test directly:"
    echo "./scripts/test-auth.sh \"$ACCESS_TOKEN\""
    
else
    echo "❌ Login failed!"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
