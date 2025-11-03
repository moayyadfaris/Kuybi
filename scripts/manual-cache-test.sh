#!/bin/bash
# Complete Cache Invalidation Test

echo "🧪 Complete Attachment Cache Invalidation Test"
echo "=============================================="
echo ""

# Check if server is running
if ! curl -s http://localhost:4040/api/health > /dev/null 2>&1; then
  echo "❌ Server is not running on port 4040"
  echo "   Please start with: npm run start:dev"
  exit 1
fi

echo "✅ Server is running"
echo ""

# Get token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkYjlmZWYzNy01YTliLTRkNzQtODJmNC1mMmM3NTNlZDE3OWUiLCJlbWFpbCI6ImFkbWluQHN1c2Fuby5kZXYiLCJyb2xlIjoic3VwZXItYWRtaW4iLCJpYXQiOjE3NjIxNzMzNDQsImV4cCI6MTc2MjE3Njk0NH0.lqE-_b516kqpwgIrByKbB8xRkHEABCnRy-h1CWZ6EnQ"

# Step 1: Clear ALL Redis cache
echo "1️⃣ Clearing all Redis cache..."
redis-cli FLUSHDB > /dev/null
echo "   ✅ Cache cleared"
echo ""

# Step 2: Call list API (will create cache)
echo "2️⃣ Calling list API (will create cache entry)..."
RESPONSE=$(curl -s "http://localhost:4040/api/v1/attachments" \
  -H "Authorization: Bearer $TOKEN")

COUNT=$(echo "$RESPONSE" | jq -r '.data.total // 0')
echo "   Current count: $COUNT"
echo ""

# Step 3: Check Redis keys created
echo "3️⃣ Checking Redis keys created..."
KEYS=$(redis-cli --scan --pattern "*")
echo "   Keys in Redis:"
echo "$KEYS" | sed 's/^/     /'
KEYCOUNT=$(echo "$KEYS" | wc -l | tr -d ' ')
echo "   Total keys: $KEYCOUNT"
echo ""

# Step 4: Find the exact cache key format
echo "4️⃣ Finding attachment list cache key..."
LIST_KEY=$(redis-cli --scan --pattern "*attachment*list*" | head -1)
if [ -n "$LIST_KEY" ]; then
  echo "   Found: $LIST_KEY"
  TTL=$(redis-cli TTL "$LIST_KEY")
  echo "   TTL: $TTL seconds"
else
  echo "   ❌ No list cache key found!"
fi
echo ""

# Step 5: Create test image for upload
echo "5️⃣ Creating test image..."
TEST_IMAGE="/tmp/test-cache-$(date +%s).jpg"
if command -v convert &> /dev/null; then
  convert -size 100x100 xc:blue "$TEST_IMAGE" 2>/dev/null
  echo "   ✅ Test image created: $TEST_IMAGE"
else
  # Create a minimal JPEG if ImageMagick not available
  echo "   Using placeholder (ImageMagick not found)"
  echo "fake image content" > "$TEST_IMAGE"
fi
echo ""

echo "📋 Current State:"
echo "   - Attachments in DB: $COUNT"
echo "   - Cache keys: $KEYCOUNT"
echo "   - List cache key: ${LIST_KEY:-"NOT FOUND"}"
echo ""

echo "🎯 Now let's test cache invalidation:"
echo ""
echo "STEP A: Upload a new attachment"
echo "   Run this command:"
echo "   curl -X POST http://localhost:4040/api/v1/attachments \\"
echo "     -H 'Authorization: Bearer $TOKEN' \\"
echo "     -F 'file=@$TEST_IMAGE'"
echo ""

echo "STEP B: Check if cache was invalidated"
echo "   Run: redis-cli --scan --pattern '*attachment*list*'"
echo "   Expected: EMPTY (cache should be deleted)"
echo ""

echo "STEP C: Call list API again"
echo "   Run: curl -s http://localhost:4040/api/v1/attachments -H 'Authorization: Bearer $TOKEN' | jq '.data.total'"
echo "   Expected: $((COUNT + 1)) (should show new attachment)"
echo ""

echo "STEP D: Check if cache was recreated"
echo "   Run: redis-cli --scan --pattern '*attachment*list*'"
echo "   Expected: Should show the cache key again (recreated with new data)"
echo ""

echo "💡 Tip: Watch logs in real-time:"
echo "   tail -f logs/application.log | grep -i 'invalidat\\|cache'"
echo ""

echo "🧹 Cleanup: rm $TEST_IMAGE"
