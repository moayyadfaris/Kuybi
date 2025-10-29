#!/bin/bash

# Rename Kuybi to Kuybi throughout the codebase
# This script updates all references to Kuybi/kuybi/susano to Kuybi/kuybi

echo "🦊 Renaming Kuybi to Kuybi..."
echo ""

# Function to replace in file
replace_in_file() {
    local file=$1
    local from=$2
    local to=$3
    
    if [ -f "$file" ]; then
        sed -i '' "s/$from/$to/g" "$file" 2>/dev/null || sed -i "s/$from/$to/g" "$file"
    fi
}

# Replace in all TypeScript, JavaScript, JSON files
find src -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \) -exec sed -i '' 's/Kuybi/Kuybi/g' {} \;
find src -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \) -exec sed -i '' 's/kuybi/kuybi/g' {} \;
find src -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \) -exec sed -i '' 's/KUYBI/KUYBI/g' {} \;
find src -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \) -exec sed -i '' 's/susano\.dev/kuybi.dev/g' {} \;

# Replace in documentation
find docs -type f -name "*.md" -exec sed -i '' 's/Kuybi/Kuybi/g' {} \;
find docs -type f -name "*.md" -exec sed -i '' 's/kuybi/kuybi/g' {} \;
find docs -type f -name "*.md" -exec sed -i '' 's/KUYBI/KUYBI/g' {} \;
find docs -type f -name "*.md" -exec sed -i '' 's/susano\.dev/kuybi.dev/g' {} \;

# Replace in test files
find test -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' 's/Kuybi/Kuybi/g' {} \;
find test -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' 's/kuybi/kuybi/g' {} \;
find test -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' 's/KUYBI/KUYBI/g' {} \;
find test -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' 's/susano\.dev/kuybi.dev/g' {} \;

# Replace in scripts
find scripts -type f \( -name "*.sh" -o -name "*.js" \) -exec sed -i '' 's/Kuybi/Kuybi/g' {} \;
find scripts -type f \( -name "*.sh" -o -name "*.js" \) -exec sed -i '' 's/kuybi/kuybi/g' {} \;
find scripts -type f \( -name "*.sh" -o -name "*.js" \) -exec sed -i '' 's/KUYBI/KUYBI/g' {} \;

# Replace in config files
sed -i '' 's/Kuybi/Kuybi/g' package.json
sed -i '' 's/kuybi/kuybi/g' package.json
sed -i '' 's/Kuybi/Kuybi/g' package-lock.json
sed -i '' 's/kuybi/kuybi/g' package-lock.json
sed -i '' 's/Kuybi/Kuybi/g' ecosystem.config.js
sed -i '' 's/kuybi/kuybi/g' ecosystem.config.js
sed -i '' 's/Kuybi/Kuybi/g' pm2.sh
sed -i '' 's/kuybi/kuybi/g' pm2.sh
sed -i '' 's/Kuybi/Kuybi/g' .github/copilot-instructions.md
sed -i '' 's/kuybi/kuybi/g' .github/copilot-instructions.md
sed -i '' 's/susano\.dev/kuybi.dev/g' .github/copilot-instructions.md

echo "✅ Renaming complete!"
echo ""
echo "Files updated:"
echo "  - Source files (src/)"
echo "  - Documentation (docs/)"
echo "  - Tests (test/)"
echo "  - Scripts (scripts/)"
echo "  - Configuration files"
echo ""
echo "⚠️  Remember to:"
echo "  1. Update your .env file"
echo "  2. Update your database name"
echo "  3. Update S3 bucket names"
echo "  4. Update email addresses"
echo "  5. Update git remote URLs if needed"
echo ""
