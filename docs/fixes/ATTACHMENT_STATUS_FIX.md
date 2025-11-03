# Attachment Security Status Fix

## Problem

After async image processing completes, the `securityStatus` field remains stuck on `"processing"` even though `metadata.processingStatus` shows `"completed"`.

## Root Cause

The `AttachmentProcessor` was updating the metadata but not the database column `securityStatus`.

## Solution Applied

✅ **Code Fix** (Already committed in `5b48549`):
- Updated `attachment.processor.ts` to set `securityStatus: 'completed'` 
- Added error handling to set `securityStatus: 'failed'` on errors
- Worker rebuilt and restarted with new code

## Fix Existing Records

### Option 1: Using psql (Recommended)

```bash
# Connect to your database
psql -d kuybi -U postgres

# Run this SQL
UPDATE attachments
SET "securityStatus" = 'completed'
WHERE "securityStatus" = 'processing'
  AND metadata->>'processingStatus' = 'completed'
  AND "deletedAt" IS NULL;

# Verify
SELECT "securityStatus", COUNT(*) 
FROM attachments 
WHERE "deletedAt" IS NULL 
GROUP BY "securityStatus";
```

### Option 2: Using Shell Script

```bash
# Run the automated fix script
./scripts/fix-attachment-security-status.sh
```

### Option 3: Using SQL File

```bash
# Run the SQL file directly
psql -d kuybi -U postgres -f scripts/fix-attachment-security-status.sql
```

## Verification

After running the fix, check the API response:

```bash
curl 'http://localhost:4040/api/v1/attachments' \
  -H 'Authorization: Bearer YOUR_TOKEN' | jq '.data.data[0].securityStatus'
```

**Expected:** `"completed"` (not `"processing"`)

## Future Uploads

All new uploads will have the correct `securityStatus` because:
- ✅ Worker is running with updated code
- ✅ Processor now updates both `metadata.processingStatus` AND `securityStatus`
- ✅ Error handling sets status to `'failed'` if processing fails

## Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Initial status for sync uploads |
| `processing` | Currently being processed in queue |
| `completed` | Processing finished successfully ✅ |
| `failed` | Processing failed ❌ |

## Notes

- The API is working correctly (returns 1 record as expected)
- The duplicate upload prevention is now active
- Worker must be rebuilt and restarted after code changes
