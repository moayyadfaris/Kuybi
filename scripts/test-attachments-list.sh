#!/bin/bash

# Test script for Attachments List API
# Tests various filtering, sorting, and pagination options

BASE_URL="http://localhost:4040/api/v1"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Attachments List API Test ===${NC}\n"

# Login
echo -e "${GREEN}1. Getting authentication token...${NC}"
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@susano.dev","password":"Admin@123"}' | jq -r '.data.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "Failed to get token"
  exit 1
fi
echo "✓ Token acquired"

# Test 1: Basic list
echo -e "\n${GREEN}2. Test: Basic list (no filters)${NC}"
curl -s -X GET "$BASE_URL/attachments" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    total: .data.total,
    page: .data.page,
    limit: .data.limit,
    totalPages: .data.totalPages,
    count: (.data.data | length)
  }'

# Test 2: Pagination
echo -e "\n${GREEN}3. Test: Pagination (page=1, limit=1)${NC}"
curl -s -X GET "$BASE_URL/attachments?page=1&limit=1" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    total: .data.total,
    page: .data.page,
    limit: .data.limit,
    totalPages: .data.totalPages,
    items: .data.data | map({originalName, size})
  }'

# Test 3: Filter by category
echo -e "\n${GREEN}4. Test: Filter by category (category=photos)${NC}"
curl -s -X GET "$BASE_URL/attachments?category=photos" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    total: .data.total,
    items: .data.data | map({originalName, category})
  }'

# Test 4: Filter by MIME type
echo -e "\n${GREEN}5. Test: Filter by MIME type (mimeType=image/)${NC}"
curl -s -X GET "$BASE_URL/attachments?mimeType=image/" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    total: .data.total,
    items: .data.data | map({originalName, mimeType})
  }'

# Test 5: Filter by public status
echo -e "\n${GREEN}6. Test: Filter by public status (isPublic=true)${NC}"
curl -s -X GET "$BASE_URL/attachments?isPublic=true" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    total: .data.total,
    items: .data.data | map({originalName, isPublic})
  }'

# Test 6: Filter by security status
echo -e "\n${GREEN}7. Test: Filter by security status (securityStatus=pending)${NC}"
curl -s -X GET "$BASE_URL/attachments?securityStatus=pending" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    total: .data.total,
    items: .data.data | map({originalName, securityStatus})
  }'

# Test 7: Sort by size (ascending)
echo -e "\n${GREEN}8. Test: Sort by size ASC${NC}"
curl -s -X GET "$BASE_URL/attachments?sortBy=size&sortOrder=ASC" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    items: .data.data | map({originalName, size})
  }'

# Test 8: Sort by size (descending)
echo -e "\n${GREEN}9. Test: Sort by size DESC${NC}"
curl -s -X GET "$BASE_URL/attachments?sortBy=size&sortOrder=DESC" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    items: .data.data | map({originalName, size})
  }'

# Test 9: Filter by size range
echo -e "\n${GREEN}10. Test: Filter by size range (minSize=100, maxSize=50000)${NC}"
curl -s -X GET "$BASE_URL/attachments?minSize=100&maxSize=50000" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    total: .data.total,
    items: .data.data | map({originalName, size})
  }'

# Test 10: Combined filters
echo -e "\n${GREEN}11. Test: Combined filters (category=photos, isPublic=true, sortBy=size)${NC}"
curl -s -X GET "$BASE_URL/attachments?category=photos&isPublic=true&sortBy=size&sortOrder=DESC" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    total: .data.total,
    items: .data.data | map({originalName, category, isPublic, size})
  }'

# Test 11: Sort by name
echo -e "\n${GREEN}12. Test: Sort by originalName ASC${NC}"
curl -s -X GET "$BASE_URL/attachments?sortBy=originalName&sortOrder=ASC" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    items: .data.data | map({originalName})
  }'

# Test 12: Sort by createdAt (default)
echo -e "\n${GREEN}13. Test: Default sort (createdAt DESC - most recent first)${NC}"
curl -s -X GET "$BASE_URL/attachments" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    items: .data.data | map({originalName, createdAt})
  }'

echo -e "\n${BLUE}=== All tests completed! ===${NC}"
