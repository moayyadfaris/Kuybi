#!/bin/bash

# Quick ACL Test Script
# Prerequisites: Server must be running on port 3000

API_URL="http://localhost:3000/api"

echo "🔍 Quick ACL System Test"
echo "========================"
echo ""

# Step 1: Login to get token
echo "📝 Step 1: Login as admin"
echo "Run this command in another terminal:"
echo ""
echo "curl -X POST http://localhost:3000/api/v1/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\": \"your-admin-email@example.com\", \"password\": \"your-password\"}'"
echo ""
read -p "Paste your JWT token here: " TOKEN
echo ""

if [ -z "$TOKEN" ]; then
    echo "❌ No token provided. Exiting."
    exit 1
fi

# Test 2: Get all roles
echo "✅ Test 1: GET /v1/roles - List all roles"
curl -s -X GET "$API_URL/v1/roles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" | jq '.' || echo "Failed"
echo ""

# Test 3: Get all permissions
echo "✅ Test 2: GET /v1/permissions - List all permissions (first 5)"
curl -s -X GET "$API_URL/v1/permissions" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" | jq '.[0:5]' || echo "Failed"
echo ""

# Test 4: Get super-admin role
echo "✅ Test 3: GET /v1/roles/1 - Get super-admin role"
curl -s -X GET "$API_URL/v1/roles/1" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" | jq '.' || echo "Failed"
echo ""

# Test 5: Get super-admin permissions
echo "✅ Test 4: GET /v1/roles/1/permissions - Get super-admin permissions (first 5)"
curl -s -X GET "$API_URL/v1/roles/1/permissions" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" | jq '.[0:5]' || echo "Failed"
echo ""

# Test 6: Filter permissions by subject
echo "✅ Test 5: GET /v1/permissions?subject=Story - Filter story permissions"
curl -s -X GET "$API_URL/v1/permissions?subject=Story" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" | jq '.' || echo "Failed"
echo ""

# Test 7: Test unauthorized access (should fail with 401/403)
echo "✅ Test 6: Test without token (should fail with 401)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/v1/roles")
if [ "$HTTP_CODE" = "401" ]; then
    echo "✅ Authorization working correctly (HTTP $HTTP_CODE)"
else
    echo "⚠️  Expected 401, got $HTTP_CODE"
fi
echo ""

# Test 8: Create a test role
echo "✅ Test 7: POST /v1/roles - Create test role 'test-editor'"
RESPONSE=$(curl -s -X POST "$API_URL/v1/roles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "test-editor",
        "description": "Test content editor role",
        "priority": 65,
        "isActive": true
    }')
echo "$RESPONSE" | jq '.'
NEW_ROLE_ID=$(echo "$RESPONSE" | jq -r '.id' 2>/dev/null)
echo ""

# Test 9: Assign permissions to the new role
if [ -n "$NEW_ROLE_ID" ] && [ "$NEW_ROLE_ID" != "null" ]; then
    echo "✅ Test 8: POST /v1/roles/$NEW_ROLE_ID/permissions - Assign permissions"
    curl -s -X POST "$API_URL/v1/roles/$NEW_ROLE_ID/permissions" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"permissionIds": [6, 7, 8]}' | jq '.'
    echo ""
    
    echo "✅ Test 9: GET /v1/roles/$NEW_ROLE_ID/permissions - Verify assigned permissions"
    curl -s -X GET "$API_URL/v1/roles/$NEW_ROLE_ID/permissions" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" | jq '.'
    echo ""
    
    echo "✅ Test 10: DELETE /v1/roles/$NEW_ROLE_ID - Clean up test role"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/roles/$NEW_ROLE_ID" \
        -H "Authorization: Bearer $TOKEN")
    if [ "$HTTP_CODE" = "204" ]; then
        echo "✅ Test role deleted successfully (HTTP $HTTP_CODE)"
    else
        echo "⚠️  Delete failed (HTTP $HTTP_CODE)"
    fi
    echo ""
fi

echo "========================"
echo "✅ Quick tests completed!"
echo ""
echo "📊 Database verification:"
echo "Run these SQL queries to verify data:"
echo ""
echo "-- Check roles"
echo "SELECT id, name, priority, is_active FROM roles ORDER BY priority DESC;"
echo ""
echo "-- Check permissions count"
echo "SELECT COUNT(*) as total_permissions FROM permissions;"
echo ""
echo "-- Check role-permission assignments"
echo "SELECT r.name, COUNT(rp.id) as permission_count"
echo "FROM roles r"
echo "LEFT JOIN role_permissions rp ON r.id = rp.role_id"
echo "GROUP BY r.id, r.name"
echo "ORDER BY r.priority DESC;"
echo ""
