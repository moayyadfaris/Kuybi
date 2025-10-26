#!/bin/bash

# ACL Guard Testing Script
# Tests permission enforcement across all protected endpoints

API_URL="http://localhost:4040/api"
SUPER_ADMIN_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkYjlmZWYzNy01YTliLTRkNzQtODJmNC1mMmM3NTNlZDE3OWUiLCJlbWFpbCI6ImFkbWluQHN1c2Fuby5kZXYiLCJyb2xlIjoic3VwZXItYWRtaW4iLCJpYXQiOjE3NjEzOTk3NzYsImV4cCI6MTc2MTQwMDM3Nn0.bKAI8VnD3nXx4ytf_JLT_rLxuXX9_YHc7lH8OfrrP5o"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     ACL Guard Permission Enforcement Test Suite       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

PASSED=0
FAILED=0
TOTAL=0

# Test function
test_endpoint() {
    local TEST_NAME="$1"
    local METHOD="$2"
    local ENDPOINT="$3"
    local TOKEN="$4"
    local DATA="$5"
    local EXPECTED_STATUS="$6"
    local DESCRIPTION="$7"
    
    TOTAL=$((TOTAL + 1))
    
    echo -e "${YELLOW}Test $TOTAL: $TEST_NAME${NC}"
    echo "  Description: $DESCRIPTION"
    echo "  Endpoint: $METHOD $ENDPOINT"
    echo "  Expected: HTTP $EXPECTED_STATUS"
    
    if [ -z "$DATA" ]; then
        RESPONSE=$(curl -s -w "\n%{http_code}" -X "$METHOD" "$API_URL$ENDPOINT" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" 2>/dev/null)
    else
        RESPONSE=$(curl -s -w "\n%{http_code}" -X "$METHOD" "$API_URL$ENDPOINT" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$DATA" 2>/dev/null)
    fi
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "$EXPECTED_STATUS" ]; then
        echo -e "  ${GREEN}✓ PASS${NC} - Got HTTP $HTTP_CODE"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${RED}✗ FAIL${NC} - Got HTTP $HTTP_CODE (expected $EXPECTED_STATUS)"
        if [ -n "$BODY" ]; then
            echo "  Response: $(echo "$BODY" | jq -c '.' 2>/dev/null || echo "$BODY")"
        fi
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Phase 1: Test Unauthorized Access (No Token)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# All protected endpoints should return 401 without token
test_endpoint \
    "Stories - Create without token" \
    "POST" \
    "/v1/stories" \
    "" \
    '{"title":"Test","content":"Test"}' \
    "401" \
    "Should deny creation without authentication"

test_endpoint \
    "Categories - Create without token" \
    "POST" \
    "/v1/categories" \
    "" \
    '{"name":"Test","slug":"test"}' \
    "401" \
    "Should deny creation without authentication"

test_endpoint \
    "Tags - Create without token" \
    "POST" \
    "/v1/tags" \
    "" \
    '{"name":"test"}' \
    "401" \
    "Should deny creation without authentication"

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Phase 2: Test Super-Admin Permissions${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Super-admin should have access to everything
test_endpoint \
    "Stories - Create as super-admin" \
    "POST" \
    "/v1/stories" \
    "$SUPER_ADMIN_TOKEN" \
    '{"title":"Super Admin Story","content":"Testing super admin access","type":"article","status":"draft"}' \
    "201" \
    "Super-admin can create stories"

# Store story ID for later tests
STORY_RESPONSE=$(curl -s -X POST "$API_URL/v1/stories" \
    -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Test Story for ACL","content":"Content","type":"article","status":"draft"}')
STORY_ID=$(echo "$STORY_RESPONSE" | jq -r '.data.id // .id // empty' 2>/dev/null)

if [ -n "$STORY_ID" ] && [ "$STORY_ID" != "null" ]; then
    echo -e "${GREEN}Created test story with ID: $STORY_ID${NC}"
    echo ""
    
    test_endpoint \
        "Stories - Update as super-admin" \
        "PATCH" \
        "/v1/stories/$STORY_ID" \
        "$SUPER_ADMIN_TOKEN" \
        '{"title":"Updated Title"}' \
        "200" \
        "Super-admin can update stories"
    
    test_endpoint \
        "Stories - Update status as super-admin" \
        "PATCH" \
        "/v1/stories/$STORY_ID/status" \
        "$SUPER_ADMIN_TOKEN" \
        '{"status":"published"}' \
        "200" \
        "Super-admin can publish stories"
fi

test_endpoint \
    "Categories - Create as super-admin" \
    "POST" \
    "/v1/categories" \
    "$SUPER_ADMIN_TOKEN" \
    '{"name":"Test Category","slug":"test-category","description":"Testing ACL"}' \
    "201" \
    "Super-admin can create categories"

# Store category ID
CATEGORY_RESPONSE=$(curl -s -X POST "$API_URL/v1/categories" \
    -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"ACL Test Category","slug":"acl-test-cat","description":"For testing"}')
CATEGORY_ID=$(echo "$CATEGORY_RESPONSE" | jq -r '.data.id // .id // empty' 2>/dev/null)

if [ -n "$CATEGORY_ID" ] && [ "$CATEGORY_ID" != "null" ]; then
    echo -e "${GREEN}Created test category with ID: $CATEGORY_ID${NC}"
    echo ""
    
    test_endpoint \
        "Categories - Update as super-admin" \
        "PATCH" \
        "/v1/categories/$CATEGORY_ID" \
        "$SUPER_ADMIN_TOKEN" \
        '{"description":"Updated description"}' \
        "200" \
        "Super-admin can update categories"
    
    test_endpoint \
        "Categories - Delete as super-admin" \
        "DELETE" \
        "/v1/categories/$CATEGORY_ID" \
        "$SUPER_ADMIN_TOKEN" \
        "" \
        "204" \
        "Super-admin can soft delete categories"
fi

test_endpoint \
    "Tags - Create as super-admin" \
    "POST" \
    "/v1/tags" \
    "$SUPER_ADMIN_TOKEN" \
    '{"name":"acl-test","description":"Testing ACL guards"}' \
    "201" \
    "Super-admin can create tags"

# Store tag ID
TAG_RESPONSE=$(curl -s -X POST "$API_URL/v1/tags" \
    -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"guard-test","description":"For ACL guard testing"}')
TAG_ID=$(echo "$TAG_RESPONSE" | jq -r '.data.id // .id // empty' 2>/dev/null)

if [ -n "$TAG_ID" ] && [ "$TAG_ID" != "null" ]; then
    echo -e "${GREEN}Created test tag with ID: $TAG_ID${NC}"
    echo ""
    
    test_endpoint \
        "Tags - Update as super-admin" \
        "PATCH" \
        "/v1/tags/$TAG_ID" \
        "$SUPER_ADMIN_TOKEN" \
        '{"description":"Updated description"}' \
        "200" \
        "Super-admin can update tags"
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Phase 3: Test Read Operations (Public Access)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Read operations should work without token (or return data)
test_endpoint \
    "Stories - List all (public)" \
    "GET" \
    "/v1/stories" \
    "" \
    "" \
    "200" \
    "Public can read stories list"

test_endpoint \
    "Tags - List all (public)" \
    "GET" \
    "/v1/tags" \
    "" \
    "" \
    "200" \
    "Public can read tags list"

if [ -n "$STORY_ID" ] && [ "$STORY_ID" != "null" ]; then
    test_endpoint \
        "Stories - Get single story (public)" \
        "GET" \
        "/v1/stories/$STORY_ID" \
        "" \
        "" \
        "200" \
        "Public can read individual stories"
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Phase 4: Test ACL Endpoints (Admin Only)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

test_endpoint \
    "ACL - List roles as super-admin" \
    "GET" \
    "/v1/roles" \
    "$SUPER_ADMIN_TOKEN" \
    "" \
    "200" \
    "Super-admin can list roles"

test_endpoint \
    "ACL - List permissions as super-admin" \
    "GET" \
    "/v1/permissions" \
    "$SUPER_ADMIN_TOKEN" \
    "" \
    "200" \
    "Super-admin can list permissions"

test_endpoint \
    "ACL - Create role as super-admin" \
    "POST" \
    "/v1/roles" \
    "$SUPER_ADMIN_TOKEN" \
    '{"name":"test-role","description":"Testing role creation","priority":55}' \
    "201" \
    "Super-admin can create roles"

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Phase 5: Test System Protection${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

test_endpoint \
    "System Protection - Delete system role" \
    "DELETE" \
    "/v1/roles/1" \
    "$SUPER_ADMIN_TOKEN" \
    "" \
    "400" \
    "Cannot delete system roles (even as super-admin)"

test_endpoint \
    "System Protection - Delete super-admin role" \
    "DELETE" \
    "/v1/roles/1" \
    "$SUPER_ADMIN_TOKEN" \
    "" \
    "400" \
    "System roles are protected from deletion"

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Phase 6: Test Story Attachment/Tag Management${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$STORY_ID" ] && [ "$STORY_ID" != "null" ] && [ -n "$TAG_ID" ] && [ "$TAG_ID" != "null" ]; then
    test_endpoint \
        "Stories - Attach tags as super-admin" \
        "POST" \
        "/v1/stories/$STORY_ID/tags" \
        "$SUPER_ADMIN_TOKEN" \
        "{\"tagIds\":[$TAG_ID]}" \
        "200" \
        "Super-admin can attach tags to stories"
    
    test_endpoint \
        "Stories - Get story tags (public)" \
        "GET" \
        "/v1/stories/$STORY_ID/tags" \
        "" \
        "" \
        "200" \
        "Public can read story tags"
    
    test_endpoint \
        "Stories - Detach tags as super-admin" \
        "DELETE" \
        "/v1/stories/$STORY_ID/tags" \
        "$SUPER_ADMIN_TOKEN" \
        "{\"tagIds\":[$TAG_ID]}" \
        "200" \
        "Super-admin can detach tags from stories"
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Phase 7: Test Hard Delete (Super-Admin Only)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$STORY_ID" ] && [ "$STORY_ID" != "null" ]; then
    # First soft delete
    curl -s -X DELETE "$API_URL/v1/stories/$STORY_ID" \
        -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" > /dev/null 2>&1
    
    test_endpoint \
        "Stories - Hard delete as super-admin" \
        "DELETE" \
        "/v1/stories/$STORY_ID/hard" \
        "$SUPER_ADMIN_TOKEN" \
        "" \
        "204" \
        "Super-admin can permanently delete stories"
fi

if [ -n "$TAG_ID" ] && [ "$TAG_ID" != "null" ]; then
    # First soft delete
    curl -s -X DELETE "$API_URL/v1/tags/$TAG_ID" \
        -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" > /dev/null 2>&1
    
    test_endpoint \
        "Tags - Hard delete as super-admin" \
        "DELETE" \
        "/v1/tags/$TAG_ID/hard" \
        "$SUPER_ADMIN_TOKEN" \
        "" \
        "204" \
        "Super-admin can permanently delete tags"
fi

# Cleanup: Delete test role
curl -s -X GET "$API_URL/v1/roles" -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" | \
    jq -r '.data[] | select(.name == "test-role") | .id' 2>/dev/null | \
    while read role_id; do
        if [ -n "$role_id" ] && [ "$role_id" != "null" ]; then
            curl -s -X DELETE "$API_URL/v1/roles/$role_id" \
                -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" > /dev/null 2>&1
        fi
    done

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Test Summary                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Total Tests:  ${BLUE}$TOTAL${NC}"
echo -e "Passed:       ${GREEN}$PASSED${NC}"
echo -e "Failed:       ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          ✓ ALL TESTS PASSED!                          ║${NC}"
    echo -e "${GREEN}║   ACL Guards are working correctly!                   ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║          ✗ SOME TESTS FAILED                          ║${NC}"
    echo -e "${RED}║   Please review the failures above                    ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
