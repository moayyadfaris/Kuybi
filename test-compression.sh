#!/bin/bash

# Test Response Compression Script
# Usage: ./test-compression.sh [url]

URL="${1:-http://localhost:4040/api/health}"

echo "🧪 Testing Response Compression for: $URL"
echo "================================================"
echo ""

# Test 1: Check if Content-Encoding header is present
echo "📋 Test 1: Checking for gzip encoding..."
ENCODING=$(curl -s -H "Accept-Encoding: gzip" -I "$URL" | grep -i "content-encoding")
if [ -n "$ENCODING" ]; then
    echo "✅ $ENCODING"
else
    echo "❌ No Content-Encoding header found (response not compressed)"
fi
echo ""

# Test 2: Compare compressed vs uncompressed sizes
echo "📏 Test 2: Comparing response sizes..."
UNCOMPRESSED_SIZE=$(curl -s -H "Accept-Encoding: identity" "$URL" | wc -c | tr -d ' ')
COMPRESSED_SIZE=$(curl -s -H "Accept-Encoding: gzip" "$URL" -w "%{size_download}" -o /dev/null)

echo "   Uncompressed: $UNCOMPRESSED_SIZE bytes"
echo "   Compressed:   $COMPRESSED_SIZE bytes"

if [ "$COMPRESSED_SIZE" -lt "$UNCOMPRESSED_SIZE" ]; then
    REDUCTION=$((100 - (COMPRESSED_SIZE * 100 / UNCOMPRESSED_SIZE)))
    echo "   💾 Savings:   $REDUCTION% reduction"
    echo "✅ Compression is working!"
else
    echo "⚠️  Response might be too small to compress (threshold: 1024 bytes)"
fi
echo ""

# Test 3: Show full headers
echo "📄 Test 3: Response Headers..."
curl -s -H "Accept-Encoding: gzip" -I "$URL" | grep -E "(HTTP|Content-|Transfer-)"
echo ""

# Test 4: Test x-no-compression header
echo "🚫 Test 4: Testing x-no-compression bypass..."
NO_COMPRESS=$(curl -s -H "Accept-Encoding: gzip" -H "x-no-compression: true" -I "$URL" | grep -i "content-encoding")
if [ -z "$NO_COMPRESS" ]; then
    echo "✅ Compression correctly bypassed with x-no-compression header"
else
    echo "❌ x-no-compression header didn't work"
fi
echo ""

echo "================================================"
echo "✨ Test complete!"
