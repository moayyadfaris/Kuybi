#!/bin/bash

# ACL Endpoint Testing Script
# Run this after starting the application

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3000/api/v1"
ADMIN_TOKEN="" # Set this after login
USER_TOKEN=""  # Set this after creating a test user

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}     ACL System API Testing Script${NC}"
echo -e "${BLUE}==================================================${NC}\n"

# Function to print test header
print_test() {
    echo -e "\n${YELLOW}▶ $1${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Wait for server to be ready
echo -e "${BLUE}Waiting for server to be ready...${NC}"
for i in {1..30}; do
    if curl -s "$API_URL/health" > /dev/null 2>&1; then
        print_success "Server is ready!"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# ============================================
# Test 1: Health Check
# ============================================
print_test "Test 1: Health Check"
response=$(curl -s "$API_URL/health")
if echo "$response" | grep -q "ok"; then
    print_success "Health check passed"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
else
    print_error "Health check failed"
fi

# ============================================
# Test 2: Login as Admin (Get Token)
# ============================================
print_test "Test 2: Login as Admin"
echo "Please login to get your admin token:"
echo "POST $API_URL/auth/login"
echo '{"email": "admin@example.com", "password": "your-password"}'
echo ""
read -p "Enter your admin JWT token: " ADMIN_TOKEN
echo ""

if [ -z "$ADMIN_TOKEN" ]; then
    print_error "No token provided. Please run the script again with a valid token."
    exit 1
fi

# ============================================
# Test 3: Get All Roles
# ============================================
print_test "Test 3: GET /roles - List all roles"
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL/roles")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    print_success "Successfully retrieved roles (HTTP $http_code)"
    echo "$body" | jq '.[0:3]' 2>/dev/null || echo "$body"
else
    print_error "Failed to retrieve roles (HTTP $http_code)"
    echo "$body"
fi

# ============================================
# Test 4: Get Active Roles
# ============================================
print_test "Test 4: GET /roles/active - List active roles"
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL/roles/active")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    print_success "Successfully retrieved active roles (HTTP $http_code)"
    echo "$body" | jq '.[0:3]' 2>/dev/null || echo "$body"
else
    print_error "Failed to retrieve active roles (HTTP $http_code)"
    echo "$body"
fi

# ============================================
# Test 5: Get Specific Role (super-admin)
# ============================================
print_test "Test 5: GET /roles/1 - Get super-admin role"
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL/roles/1")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    print_success "Successfully retrieved super-admin role (HTTP $http_code)"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    print_error "Failed to retrieve role (HTTP $http_code)"
    echo "$body"
fi

# ============================================
# Test 6: Get Role Permissions
# ============================================
print_test "Test 6: GET /roles/1/permissions - Get super-admin permissions"
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL/roles/1/permissions")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    print_success "Successfully retrieved role permissions (HTTP $http_code)"
    echo "$body" | jq '.[0:3]' 2>/dev/null || echo "$body"
else
    print_error "Failed to retrieve role permissions (HTTP $http_code)"
    echo "$body"
fi

# ============================================
# Test 7: Get All Permissions
# ============================================
print_test "Test 7: GET /permissions - List all permissions"
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL/permissions")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    print_success "Successfully retrieved permissions (HTTP $http_code)"
    count=$(echo "$body" | jq '. | length' 2>/dev/null)
    echo "Total permissions: $count"
    echo "$body" | jq '.[0:3]' 2>/dev/null || echo "$body"
else
    print_error "Failed to retrieve permissions (HTTP $http_code)"
    echo "$body"
fi

# ============================================
# Test 8: Filter Permissions by Action
# ============================================
print_test "Test 8: GET /permissions?action=create - Filter by action"
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL/permissions?action=create")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    print_success "Successfully filtered permissions by action (HTTP $http_code)"
    echo "$body" | jq '.[0:3]' 2>/dev/null || echo "$body"
else
    print_error "Failed to filter permissions (HTTP $http_code)"
    echo "$body"
fi

# ============================================
# Test 9: Filter Permissions by Subject
# ============================================
print_test "Test 9: GET /permissions?subject=Story - Filter by subject"
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL/permissions?subject=Story")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    print_success "Successfully filtered permissions by subject (HTTP $http_code)"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    print_error "Failed to filter permissions (HTTP $http_code)"
    echo "$body"
fi

# ============================================
# Test 10: Filter Permissions by Action and Subject
# ============================================
print_test "Test 10: GET /permissions?action=update&subject=Story - Filter by both"
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL/permissions?action=update&subject=Story")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    print_success "Successfully filtered by action and subject (HTTP $http_code)"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    print_error "Failed to filter permissions (HTTP $http_code)"
    echo "$body"
fi

# ============================================
# Test 11: Create New Role
# ============================================
print_test "Test 11: POST /roles - Create new role 'content-editor'"
response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "content-editor",
        "description": "Content editor with limited permissions",
        "priority": 60,
        "isActive": true
    }' \
    "$API_URL/roles")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "201" ]; then
    print_success "Successfully created new role (HTTP $http_code)"
    NEW_ROLE_ID=$(echo "$body" | jq -r '.id' 2>/dev/null)
    echo "New Role ID: $NEW_ROLE_ID"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    print_error "Failed to create role (HTTP $http_code)"
    echo "$body"
    NEW_ROLE_ID=""
fi

# ============================================
# Test 12: Assign Permissions to Role
# ============================================
if [ -n "$NEW_ROLE_ID" ]; then
    print_test "Test 12: POST /roles/$NEW_ROLE_ID/permissions - Assign permissions"
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "permissionIds": [6, 7, 8, 15, 16]
        }' \
        "$API_URL/roles/$NEW_ROLE_ID/permissions")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        print_success "Successfully assigned permissions to role (HTTP $http_code)"
        echo "$body" | jq '.rolePermissions[0:3]' 2>/dev/null || echo "$body"
    else
        print_error "Failed to assign permissions (HTTP $http_code)"
        echo "$body"
    fi
fi

# ============================================
# Test 13: Update Role
# ============================================
if [ -n "$NEW_ROLE_ID" ]; then
    print_test "Test 13: PUT /roles/$NEW_ROLE_ID - Update role description"
    response=$(curl -s -w "\n%{http_code}" \
        -X PUT \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "description": "Updated: Content editor with story permissions"
        }' \
        "$API_URL/roles/$NEW_ROLE_ID")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        print_success "Successfully updated role (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        print_error "Failed to update role (HTTP $http_code)"
        echo "$body"
    fi
fi

# ============================================
# Test 14: Test Permission Enforcement (403)
# ============================================
print_test "Test 14: Test permission enforcement without token (should fail)"
response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{
        "name": "unauthorized-role",
        "description": "Should fail"
    }' \
    "$API_URL/roles")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
    print_success "Permission enforcement working (HTTP $http_code - Unauthorized/Forbidden)"
else
    print_error "Permission enforcement may not be working (HTTP $http_code)"
fi

# ============================================
# Test 15: Remove Permissions from Role
# ============================================
if [ -n "$NEW_ROLE_ID" ]; then
    print_test "Test 15: DELETE /roles/$NEW_ROLE_ID/permissions - Remove permissions"
    response=$(curl -s -w "\n%{http_code}" \
        -X DELETE \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "permissionIds": [6]
        }' \
        "$API_URL/roles/$NEW_ROLE_ID/permissions")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        print_success "Successfully removed permissions (HTTP $http_code)"
        echo "$body" | jq '.rolePermissions[0:3]' 2>/dev/null || echo "$body"
    else
        print_error "Failed to remove permissions (HTTP $http_code)"
        echo "$body"
    fi
fi

# ============================================
# Test 16: Delete Role (Soft Delete)
# ============================================
if [ -n "$NEW_ROLE_ID" ]; then
    print_test "Test 16: DELETE /roles/$NEW_ROLE_ID - Soft delete role"
    response=$(curl -s -w "\n%{http_code}" \
        -X DELETE \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        "$API_URL/roles/$NEW_ROLE_ID")
    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" = "204" ]; then
        print_success "Successfully deleted role (HTTP $http_code)"
    else
        print_error "Failed to delete role (HTTP $http_code)"
    fi
fi

# ============================================
# Test 17: Try to Delete System Role (Should Fail)
# ============================================
print_test "Test 17: DELETE /roles/1 - Try to delete system role (should fail)"
response=$(curl -s -w "\n%{http_code}" \
    -X DELETE \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL/roles/1")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "400" ]; then
    print_success "System role protection working (HTTP $http_code)"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    print_error "System role protection may not be working (HTTP $http_code)"
    echo "$body"
fi

# ============================================
# Summary
# ============================================
echo -e "\n${BLUE}==================================================${NC}"
echo -e "${BLUE}     Test Summary${NC}"
echo -e "${BLUE}==================================================${NC}\n"
echo "All ACL endpoint tests completed!"
echo ""
echo "Next steps:"
echo "1. Review the test results above"
echo "2. Check database to verify data persistence"
echo "3. Test with different user roles (create test users)"
echo "4. Test ownership checks (${userId} conditions)"
echo "5. Test time-based role expiration"
echo ""
echo "For comprehensive testing, see:"
echo "docs/features/acl/TESTING_GUIDE.md"
echo ""
