'use strict';

const path = require('path');
const fs = require('fs');
let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  const os = require('os').platform();
  console.error('\n' + '='.repeat(60));
  console.error('📵 DATABASE COMPILATION ERROR DETECTED');
  console.error('The native "better-sqlite3" module failed to load.');
  console.error('');
  
  if (os === 'darwin') {
    console.error('TO FIX ON MACOS:');
    console.error('1. Install Xcode tools: xcode-select --install');
    console.error('2. Rebuild the module:   npm run rebuild');
  } else if (os === 'win32') {
    console.error('TO FIX ON WINDOWS:');
    console.error('1. Install build tools:  npm install --global windows-build-tools (as Admin)');
    console.error('2. Rebuild the module:   npm run rebuild');
  } else {
    console.error('TO FIX ON LINUX/UBUNTU:');
    console.error('1. Install build tools:  sudo apt install -y build-essential python3');
    console.error('2. Rebuild the module:   npm run rebuild');
  }
  
  console.error('='.repeat(60) + '\n');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'spam_numbers.db');

let _db = null;

function getDb() {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
  _db.pragma('foreign_keys = ON');

  return _db;
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, closeDb };
