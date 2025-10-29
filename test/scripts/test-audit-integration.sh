#!/bin/bash

echo "========================================="
echo "🧪 TESTING AUDIT LOGGING INTEGRATION"
echo "========================================="
echo ""

# Test 1: Login (should create audit log)
echo "1️⃣  Testing Login with Audit Logging..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4040/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@susano.dev","password":"Admin@123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Login successful"
echo ""

# Wait for audit log to be written
sleep 2

# Test 2: Check audit logs for login event
echo "2️⃣  Checking Audit Logs for Login Event..."
AUDIT_LOGS=$(curl -s -X GET "http://localhost:4040/api/audit/search?action=login&limit=5" \
  -H "Authorization: Bearer $TOKEN")

echo "$AUDIT_LOGS" | python3 -m json.tool | head -30
echo ""

# Test 3: Check total audit logs
echo "3️⃣  Checking Total Audit Log Count..."
TOTAL=$(echo "$AUDIT_LOGS" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['total'])")
echo "Total audit logs: $TOTAL"
echo ""

# Test 4: Logout (should create audit log)
echo "4️⃣  Testing Logout with Audit Logging..."
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['refreshToken'])" 2>/dev/null)

LOGOUT_RESPONSE=$(curl -s -X POST http://localhost:4040/api/v1/auth/logout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")

echo "$LOGOUT_RESPONSE" | python3 -m json.tool | head -15
echo ""

# Wait for audit log to be written
sleep 2

# Test 5: Check audit logs again
echo "5️⃣  Checking Audit Logs After Logout..."
# Need new token for this
NEW_TOKEN=$(curl -s -X POST http://localhost:4040/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@susano.dev","password":"Admin@123"}' | \
  python3 -c "import sys, json; print(json.load(sys.stdin)['data']['accessToken'])")

AUDIT_LOGS_AFTER=$(curl -s -X GET "http://localhost:4040/api/audit/search?limit=10" \
  -H "Authorization: Bearer $NEW_TOKEN")

echo "$AUDIT_LOGS_AFTER" | python3 -m json.tool | head -40
echo ""

echo "========================================="
echo "🎉 AUDIT INTEGRATION TEST COMPLETE!"
echo "========================================="
