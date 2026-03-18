#!/bin/bash

# SpamNumbers OpenClaw Skill Deployment Script
# This script copies the SpamNumbers skill to the OpenClaw workspace,
# installs dependencies, and runs an initial data scrape.

set -e  # Exit on error

echo "📵 SpamNumbers OpenClaw Skill Deployment"
echo "========================================"
echo ""

# Step 1: Ensure workspace directory exists
echo "📁 Step 1: Creating OpenClaw workspace directory..."
OPENCLAW_SKILLS_DIR="$HOME/.openclaw/workspace/skills"
mkdir -p "$OPENCLAW_SKILLS_DIR"
if [ -d "$OPENCLAW_SKILLS_DIR" ]; then
    echo "   ✅ Workspace directory ready: $OPENCLAW_SKILLS_DIR"
else
    echo "   ❌ Failed to create workspace directory"
    exit 1
fi
echo ""

# Step 2: Copy project with absolute path
echo "📦 Step 2: Copying SpamNumbers project..."
SKILL_DIR="$OPENCLAW_SKILLS_DIR/spam-numbers"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "   ❌ Source directory not found: $SOURCE_DIR"
    exit 1
fi

# Remove existing skill directory if it exists
if [ -d "$SKILL_DIR" ]; then
    echo "   ℹ️  Removing existing installation..."
    rm -rf "$SKILL_DIR"
fi

# Copy the project
cp -r "$SOURCE_DIR" "$SKILL_DIR"

if [ -d "$SKILL_DIR" ]; then
    echo "   ✅ Project copied to: $SKILL_DIR"
else
    echo "   ❌ Failed to copy project"
    exit 1
fi
echo ""

# Step 3: Install dependencies
echo "📚 Step 3: Installing npm dependencies..."
cd "$SKILL_DIR/scripts"

if [ ! -f "package.json" ]; then
    echo "   ❌ package.json not found in scripts directory"
    exit 1
fi

# Attempt standard install
if npm install --silent; then
    echo "   ✅ Dependencies installed successfully"
else
    echo "   ⚠️ Standard npm install failed. Attempting to fix build environment..."
    if command -v apt-get >/dev/null; then
        echo "   🔧 Installing build-essential and python3..."
        sudo apt-get update -y && sudo apt-get install -y build-essential python3 || true
    fi
    echo "   🔧 Rebuilding better-sqlite3 from source..."
    npm install --build-from-source better-sqlite3 --silent || npm rebuild better-sqlite3 --build-from-source
    echo "   ✅ Native modules rebuilt"
fi
echo ""

# Step 4: Run initial scrape to populate database
echo "🌐 Step 4: Running initial spam data scrape..."
echo "   (This may take a few minutes - fetching from 8+ data sources...)"
node index.js scrape

if [ $? -eq 0 ]; then
    echo "   ✅ Initial scrape completed"
else
    echo "   ⚠️  Scrape had issues, but installation is complete"
    echo "   You can run 'cd $SKILL_DIR/scripts && node index.js scrape' later"
fi
echo ""

# Step 5: Verify installation
echo "🔍 Step 5: Verifying installation..."
if [ -f "$SKILL_DIR/scripts/data/spam_numbers.db" ]; then
    DB_SIZE=$(du -h "$SKILL_DIR/scripts/data/spam_numbers.db" | cut -f1)
    echo "   ✅ Database created (size: $DB_SIZE)"
else
    echo "   ⚠️  Database not found (run scrape manually if needed)"
fi

if [ -d "$SKILL_DIR/scripts/node_modules/better-sqlite3" ]; then
    echo "   ✅ Dependencies verified"
fi

if [ -f "$SKILL_DIR/SKILL.md" ]; then
    echo "   ✅ SKILL.md found"
fi
echo ""

echo "========================================"
echo "✅ Deployment Complete!"
echo "========================================"
echo ""
echo "📍 Skill location: $SKILL_DIR"
echo ""
echo "Quick start commands:"
echo "  cd $SKILL_DIR/scripts"
echo ""
echo "  # Lookup a phone number"
echo "  node index.js lookup 8005551234"
echo ""
echo "  # Show database statistics"
echo "  node index.js stats"
echo ""
echo "  # Run a fresh scrape"
echo "  node index.js scrape"
echo ""
echo "  # Start weekly auto-scheduler"
echo "  node index.js schedule"
echo ""
echo "  # Export to CSV"
echo "  node index.js export"
echo ""
echo "📖 See SKILL.md for full documentation"
echo ""
