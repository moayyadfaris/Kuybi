#!/bin/bash

# Log cleanup script for Kuybi NestJS
# Retains logs for 7 days, then removes them

LOG_DIR="./logs"
ARCHIVE_DIR="./logs/archive"
RETENTION_DAYS=7

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Log Cleanup Script ===${NC}"
echo "Log directory: $LOG_DIR"
echo "Retention period: $RETENTION_DAYS days"
echo ""

# Create directories if they don't exist
mkdir -p "$LOG_DIR"
mkdir -p "$ARCHIVE_DIR"

# Find and delete old archived logs
echo -e "${YELLOW}Checking for logs older than $RETENTION_DAYS days...${NC}"
OLD_LOGS=$(find "$ARCHIVE_DIR" -name "*.log" -type f -mtime +$RETENTION_DAYS 2>/dev/null)

if [ -z "$OLD_LOGS" ]; then
  echo -e "${GREEN}No old logs found to delete.${NC}"
else
  echo -e "${YELLOW}Deleting old logs:${NC}"
  find "$ARCHIVE_DIR" -name "*.log" -type f -mtime +$RETENTION_DAYS -print -delete
  echo -e "${GREEN}Old logs deleted.${NC}"
fi

# Show current disk usage
echo ""
echo -e "${YELLOW}Current log disk usage:${NC}"
du -sh "$LOG_DIR" 2>/dev/null || echo "No logs directory"

# Count archived logs
ARCHIVED_COUNT=$(find "$ARCHIVE_DIR" -name "*.log" -type f 2>/dev/null | wc -l)
echo "Archived logs: $ARCHIVED_COUNT"

echo ""
echo -e "${GREEN}=== Cleanup Complete ===${NC}"
