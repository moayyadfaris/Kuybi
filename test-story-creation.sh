#!/bin/bash

# Test script for story creation with tags

BASE_URL="http://localhost:4040/api/v1"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Story Creation Test Script ===${NC}\n"

# Step 1: Login to get access token
echo -e "${YELLOW}Step 1: Logging in...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@susano.dev",
    "password": "Admin@123"
  }')

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.accessToken // .accessToken')

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Login successful${NC}"
echo "Access Token: ${ACCESS_TOKEN:0:20}..."
echo ""

# Step 2: Create story WITHOUT tags (baseline test)
echo -e "${YELLOW}Step 2: Creating story WITHOUT tags...${NC}"
STORY_RESPONSE=$(curl -s -X POST "$BASE_URL/stories" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "title": "Test Story Without Tags",
    "details": "This is a test story to verify basic functionality works",
    "type": "story",
    "status": "draft",
    "priority": "normal"
  }')

STORY_ID=$(echo $STORY_RESPONSE | jq -r '.id')

if [ "$STORY_ID" = "null" ] || [ -z "$STORY_ID" ]; then
  echo -e "${RED}❌ Story creation failed${NC}"
  echo "Response: $STORY_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Story created successfully${NC}"
echo "Story ID: $STORY_ID"
echo ""

# Step 3: Create story WITH tag names (auto-create tags)
echo -e "${YELLOW}Step 3: Creating story WITH tag names (auto-create)...${NC}"
STORY_WITH_TAGS_RESPONSE=$(curl -s -X POST "$BASE_URL/stories" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "title": "Test Story With Tags",
    "details": "This is a test story to verify tag functionality",
    "type": "story",
    "status": "draft",
    "priority": "normal",
    "tags": ["sports", "economy", "breaking-news"]
  }')

STORY_WITH_TAGS_ID=$(echo $STORY_WITH_TAGS_RESPONSE | jq -r '.id')

if [ "$STORY_WITH_TAGS_ID" = "null" ] || [ -z "$STORY_WITH_TAGS_ID" ]; then
  echo -e "${RED}❌ Story with tags creation failed${NC}"
  echo "Response: $STORY_WITH_TAGS_RESPONSE"
else
  echo -e "${GREEN}✓ Story with tags created successfully${NC}"
  echo "Story ID: $STORY_WITH_TAGS_ID"
  echo "Tags: $(echo $STORY_WITH_TAGS_RESPONSE | jq -r '.tags | length') tags attached"
fi

echo ""
echo -e "${GREEN}=== Test Complete ===${NC}"
