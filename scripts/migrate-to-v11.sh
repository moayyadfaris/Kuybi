#!/bin/bash

# NestJS v11 Migration Script
# This script automates the migration from NestJS v10 to v11

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   NestJS v11 Migration Script         ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo ""

# Check if on main/master branch
current_branch=$(git branch --show-current)
if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
    echo -e "${RED}⚠️  WARNING: You are on the $current_branch branch!${NC}"
    echo -e "${YELLOW}It's recommended to create a feature branch for this migration.${NC}"
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Migration cancelled.${NC}"
        exit 1
    fi
fi

# Step 1: Create backups
echo -e "${BLUE}[1/7] Creating backups...${NC}"
cp package.json package.json.v10.backup
cp package-lock.json package-lock.json.v10.backup
echo -e "${GREEN}✓ Backups created${NC}"
echo ""

# Step 2: Check Node.js version
echo -e "${BLUE}[2/7] Checking Node.js version...${NC}"
node_version=$(node -v)
echo "Current Node.js version: $node_version"
if [[ "$node_version" < "v20" ]]; then
    echo -e "${RED}✗ Node.js v20+ is required for NestJS v11${NC}"
    echo -e "${YELLOW}Please upgrade Node.js to v20 or higher${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js version compatible${NC}"
echo ""

# Step 3: Install npm-check-updates if not present
echo -e "${BLUE}[3/7] Checking for npm-check-updates...${NC}"
if ! command -v ncu &> /dev/null; then
    echo "Installing npm-check-updates..."
    npm install -g npm-check-updates
fi
echo -e "${GREEN}✓ npm-check-updates ready${NC}"
echo ""

# Step 4: Update packages
echo -e "${BLUE}[4/7] Updating packages...${NC}"
echo -e "${YELLOW}This will update package.json. Review changes before proceeding.${NC}"
read -p "Continue with package updates? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Migration cancelled.${NC}"
    exit 1
fi

# Update NestJS packages to v11
echo "Updating @nestjs/* packages to v11..."
ncu -u '@nestjs/common' '@nestjs/core' '@nestjs/platform-express' '@nestjs/config' \
       '@nestjs/swagger' '@nestjs/typeorm' '@nestjs/jwt' '@nestjs/passport' \
       '@nestjs/terminus' '@nestjs/throttler' '@nestjs/cli' '@nestjs/schematics' \
       '@nestjs/testing' '@nestjs/schedule' '@nestjs/cache-manager'

# Update @keyv/redis
echo "Updating @keyv/redis..."
ncu -u '@keyv/redis'

# Update other packages (optional)
echo ""
echo -e "${YELLOW}Do you want to update other packages as well? (jest, eslint, bcrypt, etc.)${NC}"
read -p "Update all packages? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Updating all packages..."
    ncu -u
fi

echo -e "${GREEN}✓ package.json updated${NC}"
echo ""

# Step 5: Show what changed
echo -e "${BLUE}[5/7] Reviewing changes...${NC}"
echo "Package changes:"
git diff package.json
echo ""
read -p "Proceed with installation? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Restoring package.json...${NC}"
    cp package.json.v10.backup package.json
    echo -e "${YELLOW}Migration cancelled.${NC}"
    exit 1
fi

# Step 6: Install dependencies
echo -e "${BLUE}[6/7] Installing dependencies...${NC}"
echo "Removing node_modules and package-lock.json..."
rm -rf node_modules package-lock.json

echo "Installing fresh dependencies..."
npm install

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 7: Run tests
echo -e "${BLUE}[7/7] Running tests...${NC}"
echo -e "${YELLOW}Do you want to run tests now?${NC}"
read -p "Run tests? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Running unit tests..."
    npm run test || {
        echo -e "${RED}✗ Unit tests failed${NC}"
        echo -e "${YELLOW}Review test failures and make necessary adjustments${NC}"
    }
    
    echo ""
    echo "Running integration tests..."
    npm run test:integration || {
        echo -e "${RED}✗ Integration tests failed${NC}"
        echo -e "${YELLOW}Review test failures and make necessary adjustments${NC}"
    }
fi
echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Migration Complete!                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review any test failures"
echo "2. Test the application manually: npm run start:dev"
echo "3. Review docs/NESTJS_V11_MIGRATION.md for code changes"
echo "4. Commit changes when ready"
echo ""
echo -e "${YELLOW}Backups created:${NC}"
echo "  - package.json.v10.backup"
echo "  - package-lock.json.v10.backup"
echo ""
echo -e "${YELLOW}To rollback:${NC}"
echo "  cp package.json.v10.backup package.json"
echo "  cp package-lock.json.v10.backup package-lock.json"
echo "  rm -rf node_modules && npm install"
echo ""
