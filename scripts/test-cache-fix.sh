#!/bin/bash
# Comprehensive Cache Invalidation Test

set -e

echo "🧪 Testing Cache Invalidation Fix"
echo "=================================="
echo ""

# Login to get fresh token
echo "1️⃣ Logging in..."
TOKEN=$(curl -s -X POST http://localhost:4040/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@susano.dev","password":"Admin@123"}' | jq -r '.data.accessToken')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  exit 1
fi
echo "✅ Logged in successfully"
echo ""

# Clear Redis
echo "2️⃣ Clearing Redis cache..."
redis-cli FLUSHDB > /dev/null
echo "✅ Redis cleared"
echo ""

# Call list API (creates cache)
echo "3️⃣ Calling list API (will create cache)..."
RESPONSE=$(curl -s "http://localhost:4040/api/v1/attachments" \
  -H "Authorization: Bearer $TOKEN")
COUNT_BEFORE=$(echo "$RESPONSE" | jq -r '.data.total // 0')
echo "   Current attachments: $COUNT_BEFORE"
echo ""

# Check cache was created
echo "4️⃣ Checking cache was created..."
CACHE_KEYS_BEFORE=$(redis-cli --scan --pattern "*attachment*" | wc -l | tr -d ' ')
echo "   Cache keys: $CACHE_KEYS_BEFORE"
if [ "$CACHE_KEYS_BEFORE" -gt "0" ]; then
  echo "   ✅ Cache created"
  redis-cli --scan --pattern "*attachment*" | head -3 | sed 's/^/      /'
else
  echo "   ⚠️  No cache keys found (might not be caching)"
fi
echo ""

# Create test image
echo "5️⃣ Creating test image..."
TEST_IMAGE="/tmp/test-cache-$(date +%s).jpg"
echo "Test image content" > "$TEST_IMAGE"
echo "   Created: $TEST_IMAGE"
echo ""

# Upload attachment
echo "6️⃣ Uploading attachment..."
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:4040/api/v1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TEST_IMAGE")
UPLOAD_SUCCESS=$(echo "$UPLOAD_RESPONSE" | jq -r '.success // false')

if [ "$UPLOAD_SUCCESS" != "true" ]; then
  echo "❌ Upload failed!"
  echo "$UPLOAD_RESPONSE" | jq
  exit 1
fi
echo "✅ Upload successful"
ATTACHMENT_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.data.id')
echo "   ID: $ATTACHMENT_ID"
echo ""

# Check if cache was invalidated
echo "7️⃣ Checking if cache was invalidated..."
sleep 1  # Give it a moment
CACHE_KEYS_AFTER=$(redis-cli --scan --pattern "*attachment*list*" | wc -l | tr -d ' ')
echo "   List cache keys after upload: $CACHE_KEYS_AFTER"

if [ "$CACHE_KEYS_AFTER" -eq "0" ]; then
  echo "   ✅ SUCCESS! Cache was invalidated"
else
  echo "   ❌ FAILED! Cache still exists:"
  redis-cli --scan --pattern "*attachment*list*" | sed 's/^/      /'
fi
echo ""

# Call list API again (should show new count)
echo "8️⃣ Calling list API again..."
RESPONSE2=$(curl -s "http://localhost:4040/api/v1/attachments" \
  -H "Authorization: Bearer $TOKEN")
COUNT_AFTER=$(echo "$RESPONSE2" | jq -r '.data.total // 0')
echo "   Attachments after upload: $COUNT_AFTER"

if [ "$COUNT_AFTER" -gt "$COUNT_BEFORE" ]; then
  echo "   ✅ Count increased ($COUNT_BEFORE → $COUNT_AFTER)"
else
  echo "   ❌ Count didn't increase!"
fi
echo ""

# Check cache was recreated
echo "9️⃣ Checking if cache was recreated..."
sleep 1
CACHE_KEYS_FINAL=$(redis-cli --scan --pattern "*attachment*list*" | wc -l | tr -d ' ')
echo "   List cache keys: $CACHE_KEYS_FINAL"

if [ "$CACHE_KEYS_FINAL" -gt "0" ]; then
  echo "   ✅ Cache recreated"
else
  echo "   ⚠️  Cache not recreated (might not be caching lists)"
fi
echo ""

# Summary
echo "📊 Summary:"
echo "==========="
echo "   Before upload: $COUNT_BEFORE attachments, $CACHE_KEYS_BEFORE cache keys"
echo "   After upload:  $COUNT_AFTER attachments, $CACHE_KEYS_AFTER list cache keys"
echo "   Final state:   $CACHE_KEYS_FINAL cache keys"
echo ""

if [ "$CACHE_KEYS_AFTER" -eq "0" ] && [ "$COUNT_AFTER" -gt "$COUNT_BEFORE" ]; then
  echo "✅ CACHE INVALIDATION WORKING!"
  echo "   - Cache was cleared after upload"
  echo "   - New attachment visible in list"
else
  echo "❌ CACHE INVALIDATION ISSUE"
  if [ "$CACHE_KEYS_AFTER" -gt "0" ]; then
    echo "   - Cache was NOT cleared after upload"
  fi
  if [ "$COUNT_AFTER" -le "$COUNT_BEFORE" ]; then
    echo "   - New attachment NOT visible in list"
  fi
fi
echo ""

# Cleanup
echo "🧹 Cleanup..."
rm -f "$TEST_IMAGE"
echo "   ✅ Test image removed"
