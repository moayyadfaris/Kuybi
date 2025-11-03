#!/bin/bash
# Fix Attachment Security Status
# Updates attachments where processing completed but securityStatus wasn't updated

echo "🔧 Fixing attachment security status..."
echo ""

# Get database connection details from environment or use defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-kuybi}"
DB_USER="${DB_USER:-postgres}"

# Run the SQL fix
psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" << 'EOF'
-- Update attachments where metadata.processingStatus = 'completed' but securityStatus is still 'processing'
UPDATE attachments
SET "securityStatus" = 'completed'
WHERE "securityStatus" = 'processing'
  AND metadata->>'processingStatus' = 'completed'
  AND "deletedAt" IS NULL;

-- Show results
\echo ''
\echo '✅ Updated records. Current status distribution:'
\echo ''

SELECT 
  "securityStatus",
  COUNT(*) as count
FROM attachments
WHERE "deletedAt" IS NULL
GROUP BY "securityStatus"
ORDER BY count DESC;

\echo ''
\echo '📝 Recent attachments:'
\echo ''

SELECT 
  id,
  "originalName",
  "securityStatus",
  metadata->>'processingStatus' as metadata_status,
  "createdAt"
FROM attachments
WHERE "deletedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 5;
EOF

echo ""
echo "✨ Done!"
