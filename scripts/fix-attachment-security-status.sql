-- Fix existing attachments with stuck 'processing' status
-- Run this SQL to update records where processing completed but securityStatus wasn't updated

-- Update attachments where metadata.processingStatus = 'completed' but securityStatus is still 'processing'
UPDATE attachments
SET "securityStatus" = 'completed'
WHERE "securityStatus" = 'processing'
  AND metadata->>'processingStatus' = 'completed'
  AND "deletedAt" IS NULL;

-- Verify the fix
SELECT 
  id,
  "originalName",
  "securityStatus",
  metadata->>'processingStatus' as metadata_status,
  "createdAt",
  "updatedAt"
FROM attachments
WHERE "deletedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 10;

-- Check securityStatus distribution after fix
SELECT 
  "securityStatus",
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE metadata->>'processingStatus' = 'completed') as metadata_completed,
  COUNT(*) FILTER (WHERE metadata->>'processingStatus' = 'queued') as metadata_queued,
  COUNT(*) FILTER (WHERE metadata->>'processingStatus' = 'failed') as metadata_failed
FROM attachments
WHERE "deletedAt" IS NULL
GROUP BY "securityStatus"
ORDER BY count DESC;
