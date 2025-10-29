#!/bin/bash

# Log rotation script for Kuybi NestJS
# Archives current logs with timestamp

LOG_DIR="./logs"
ARCHIVE_DIR="./logs/archive"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Log Rotation Script ===${NC}"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create archive directory if it doesn't exist
mkdir -p "$ARCHIVE_DIR"

# Function to rotate a log file
rotate_log() {
  local log_file=$1
  local base_name=$(basename "$log_file" .log)
  
  if [ -f "$log_file" ] && [ -s "$log_file" ]; then
    local archive_name="${base_name}_${TIMESTAMP}.log"
    echo -e "${YELLOW}Rotating:${NC} $log_file -> $ARCHIVE_DIR/$archive_name"
    
    # Copy log to archive
    cp "$log_file" "$ARCHIVE_DIR/$archive_name"
    
    # Truncate original log file
    > "$log_file"
    
    echo -e "${GREEN}✓ Rotated${NC} $archive_name"
  else
    echo -e "${YELLOW}Skipping:${NC} $log_file (empty or doesn't exist)"
  fi
}

# Rotate log files
if [ -d "$LOG_DIR" ]; then
  rotate_log "$LOG_DIR/server.log"
  rotate_log "$LOG_DIR/error.log"
  
  echo ""
  echo -e "${GREEN}=== Rotation Complete ===${NC}"
  
  # Show archive stats
  ARCHIVED_COUNT=$(find "$ARCHIVE_DIR" -name "*.log" -type f 2>/dev/null | wc -l)
  echo "Total archived logs: $ARCHIVED_COUNT"
  du -sh "$ARCHIVE_DIR" 2>/dev/null
else
  echo -e "${YELLOW}No logs directory found${NC}"
fi
