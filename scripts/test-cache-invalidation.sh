#!/bin/bash
# Test Cache Invalidation Script

echo "🧪 Testing Attachment Cache Invalidation"
echo "========================================"
echo ""

# Get token from environment or use default
TOKEN="${ADMIN_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkYjlmZWYzNy01YTliLTRkNzQtODJmNC1mMmM3NTNlZDE3OWUiLCJlbWFpbCI6ImFkbWluQHN1c2Fuby5kZXYiLCJyb2xlIjoic3VwZXItYWRtaW4iLCJpYXQiOjE3NjIxNzMzNDQsImV4cCI6MTc2MjE3Njk0NH0.lqE-_b516kqpwgIrByKbB8xRkHEABCnRy-h1CWZ6EnQ}"

# Step 1: Check Redis keys BEFORE upload
echo "1️⃣ Checking Redis cache BEFORE upload..."
CACHE_KEYS_BEFORE=$(redis-cli --scan --pattern "attachment:list:*" | wc -l)
echo "   Cache keys found: $CACHE_KEYS_BEFORE"
echo ""

# Step 2: Get current count
echo "2️⃣ Getting current attachment count..."
COUNT_BEFORE=$(curl -s "http://localhost:4040/api/v1/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.data.total // 0')
echo "   Current count: $COUNT_BEFORE"
echo ""

# Step 3: Clear Redis cache manually to test
echo "3️⃣ Manually clearing cache to verify API works..."
redis-cli DEL "attachment:list:{\"page\":1,\"limit\":20,\"sortBy\":\"createdAt\",\"sortOrder\":\"DESC\"}" > /dev/null
echo "   Cache cleared"
echo ""

# Step 4: Get count again (should hit database)
echo "4️⃣ Getting count again (should be from database)..."
COUNT_AFTER_CLEAR=$(curl -s "http://localhost:4040/api/v1/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.data.total // 0')
echo "   Count from database: $COUNT_AFTER_CLEAR"
echo ""

# Step 5: Check if cache was recreated
echo "5️⃣ Checking if cache was recreated..."
sleep 1
CACHE_EXISTS=$(redis-cli EXISTS "attachment:list:{\"page\":1,\"limit\":20,\"sortBy\":\"createdAt\",\"sortOrder\":\"DESC\"}")
if [ "$CACHE_EXISTS" = "1" ]; then
  echo "   ✅ Cache was recreated (normal behavior)"
else
  echo "   ❌ Cache was NOT recreated (might be an issue)"
fi
echo ""

# Step 6: Show cache TTL
echo "6️⃣ Checking cache TTL..."
TTL=$(redis-cli TTL "attachment:list:{\"page\":1,\"limit\":20,\"sortBy\":\"createdAt\",\"sortOrder\":\"DESC\"}")
if [ "$TTL" -gt "0" ]; then
  echo "   Cache expires in: ${TTL} seconds"
elif [ "$TTL" = "-1" ]; then
  echo "   ⚠️  Cache has no expiration (this might be a problem)"
else
  echo "   Cache doesn't exist or has no TTL"
fi
echo ""

echo "📝 Summary:"
echo "   - Attachments before: $COUNT_BEFORE"
echo "   - Cache keys before: $CACHE_KEYS_BEFORE"
echo "   - Cache TTL: $TTL seconds"
echo ""
echo "🎯 To test cache invalidation:"
echo "   1. Upload a new attachment"
echo "   2. Run: redis-cli --scan --pattern 'attachment:list:*'"
echo "   3. The cache key should be DELETED (not found)"
echo "   4. Then call the list API again"
echo "   5. Cache key should be recreated with new data"
