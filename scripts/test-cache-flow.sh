#!/bin/bash
# Complete Cache Invalidation Flow Test

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkYjlmZWYzNy01YTliLTRkNzQtODJmNC1mMmM3NTNlZDE3OWUiLCJlbWFpbCI6ImFkbWluQHN1c2Fuby5kZXYiLCJyb2xlIjoic3VwZXItYWRtaW4iLCJpYXQiOjE3NjIxNzgyMDEsImV4cCI6MTc2MjE4MTgwMX0.bAGTIWZyuU4DmpnMCx5-ptTwvnRbQwB6e6NT-nLWE3I"

echo "🧪 Cache Invalidation Flow Test"
echo "================================"
echo ""

# Step 1: Clear Redis
echo "1️⃣ Clearing Redis..."
redis-cli FLUSHDB > /dev/null
echo "   ✅ Cleared"
echo ""

# Step 2: Call list API
echo "2️⃣ Calling list API (will create cache)..."
RESPONSE=$(curl -s "http://localhost:4040/api/v1/attachments" \
  -H "Authorization: Bearer $TOKEN")

TOTAL=$(echo "$RESPONSE" | jq -r '.data.total // 0')
echo "   Current total: $TOTAL"

# Check cache
CACHE_KEYS=$(redis-cli --scan --pattern "*attachment*")
CACHE_COUNT=$(echo "$CACHE_KEYS" | grep -v '^$' | wc -l | tr -d ' ')
echo "   Cache keys created: $CACHE_COUNT"
if [ "$CACHE_COUNT" -gt 0 ]; then
  echo "   Keys:"
  echo "$CACHE_KEYS" | sed 's/^/     /'
fi
echo ""

# Step 3: Create test file
echo "3️⃣ Creating test file..."
TEST_FILE="/tmp/test-upload-$(date +%s).txt"
echo "Test upload for cache invalidation" > "$TEST_FILE"
echo "   Created: $TEST_FILE"
echo ""

# Step 4: Upload file
echo "4️⃣ Uploading file..."
UPLOAD_RESPONSE=$(curl -s -X POST "http://localhost:4040/api/v1/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TEST_FILE" \
  -F "category=test")

UPLOAD_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.data.id // empty')
if [ -z "$UPLOAD_ID" ]; then
  echo "   ❌ Upload failed!"
  echo "   Response: $UPLOAD_RESPONSE" | jq .
  exit 1
fi
echo "   ✅ Uploaded: $UPLOAD_ID"
echo ""

# Step 5: Check cache after upload (should be EMPTY due to invalidation)
echo "5️⃣ Checking cache after upload (should be empty)..."
sleep 1
CACHE_KEYS_AFTER=$(redis-cli --scan --pattern "*attachment*list*")
CACHE_COUNT_AFTER=$(echo "$CACHE_KEYS_AFTER" | grep -v '^$' | wc -l | tr -d ' ')
echo "   Cache keys: $CACHE_COUNT_AFTER"
if [ "$CACHE_COUNT_AFTER" -eq 0 ]; then
  echo "   ✅ Cache was invalidated!"
else
  echo "   ❌ Cache still exists (invalidation failed)!"
  echo "   Keys:"
  echo "$CACHE_KEYS_AFTER" | sed 's/^/     /'
fi
echo ""

# Step 6: Call list API again
echo "6️⃣ Calling list API again (should show new total)..."
RESPONSE2=$(curl -s "http://localhost:4040/api/v1/attachments" \
  -H "Authorization: Bearer $TOKEN")

TOTAL2=$(echo "$RESPONSE2" | jq -r '.data.total // 0')
echo "   New total: $TOTAL2"
echo "   Expected: $((TOTAL + 1))"

if [ "$TOTAL2" -eq $((TOTAL + 1)) ]; then
  echo "   ✅ Total updated correctly!"
else
  echo "   ⚠️  Total mismatch (old: $TOTAL, new: $TOTAL2, expected: $((TOTAL + 1)))"
fi
echo ""

# Step 7: Check cache recreated
echo "7️⃣ Checking cache after second list call..."
CACHE_KEYS_FINAL=$(redis-cli --scan --pattern "*attachment*list*")
CACHE_COUNT_FINAL=$(echo "$CACHE_KEYS_FINAL" | grep -v '^$' | wc -l | tr -d ' ')
echo "   Cache keys: $CACHE_COUNT_FINAL"
if [ "$CACHE_COUNT_FINAL" -gt 0 ]; then
  echo "   ✅ Cache was recreated!"
  echo "   Keys:"
  echo "$CACHE_KEYS_FINAL" | sed 's/^/     /'
else
  echo "   ⚠️  No cache found (caching may be disabled)"
fi
echo ""

# Summary
echo "📊 Summary"
echo "=========="
echo "Before upload:  $TOTAL attachments, $CACHE_COUNT cache keys"
echo "After upload:   $CACHE_COUNT_AFTER cache keys (should be 0)"
echo "After list API: $TOTAL2 attachments, $CACHE_COUNT_FINAL cache keys"
echo ""

if [ "$CACHE_COUNT_AFTER" -eq 0 ] && [ "$TOTAL2" -eq $((TOTAL + 1)) ]; then
  echo "✅ CACHE INVALIDATION WORKING!"
else
  echo "❌ CACHE INVALIDATION FAILED!"
  echo ""
  echo "Debug logs:"
  tail -100 logs/application.log | grep -i "invalidat\|cache" || echo "No relevant logs found"
fi

# Cleanup
rm "$TEST_FILE"
