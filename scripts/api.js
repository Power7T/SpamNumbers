'use strict';
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { getStats, lookupNumber, getAllNumbers } = require('./db/queries');
const { spawn } = require('child_process');

let scraperProcess = null;
let liveLogs = ["[SYSTEM] OSINT API Server Initialized."];

const app = express();
const PORT = process.env.PORT || 5555;
const dbDir = path.join(__dirname, 'data');
const dbPath = path.join(dbDir, 'spam_numbers.db');
const db = new Database(dbPath);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Dashboard Summary
app.get('/api/stats', (req, res) => {
  try {
    const stats = getStats(db);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Recent Activity
app.get('/api/latest', (req, res) => {
  try {
    const latest = db.prepare(`
      SELECT * FROM spam_numbers
      WHERE is_whitelisted = 0
      ORDER BY date_last_updated DESC LIMIT 15
    `).all();
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Instant Lookup
app.get('/api/lookup/:phone', (req, res) => {
  try {
    const result = lookupNumber(db, req.params.phone);
    res.json(result || { found: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Top Global Spammers
app.get('/api/top', (req, res) => {
  try {
    const top = db.prepare(`
      SELECT * FROM spam_numbers
      WHERE is_whitelisted = 0
      ORDER BY weighted_score DESC, report_count DESC LIMIT 20
    `).all();
    res.json(top);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ENGINE CONTROLS
app.post('/api/start', (req, res) => {
  if (scraperProcess) {
    return res.json({ status: 'already_running' });
  }
  
  liveLogs.push("[OPSEC] Spawning Headless Chromium Clusters...");
  liveLogs.push("[SYS] Starting Orchestrator Pipeline...");
  
  scraperProcess = spawn('node', [path.join(__dirname, 'index.js'), 'scrape']);
  
  scraperProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim().length > 0);
    lines.forEach(l => {
      liveLogs.push(l);
      if(liveLogs.length > 100) liveLogs.shift(); // Keep last 100
    });
  });

  scraperProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim().length > 0);
    lines.forEach(l => {
      liveLogs.push('[WARN] ' + l);
      if(liveLogs.length > 100) liveLogs.shift();
    });
  });

  scraperProcess.on('close', (code) => {
    liveLogs.push(`[SYS] Pipeline Terminated (Code: ${code})`);
    scraperProcess = null;
  });

  res.json({ status: 'started' });
});

app.post('/api/stop', (req, res) => {
  if (scraperProcess) {
    scraperProcess.kill();
    scraperProcess = null;
    liveLogs.push("[SYS] ABORT SIGNAL SENT. Halting clusters...");
    res.json({ status: 'stopped' });
  } else {
    res.json({ status: 'not_running' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ isRunning: !!scraperProcess });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: liveLogs });
});

// SETTINGS (API Keys management)
app.get('/api/settings', (req, res) => {
  const envPath = path.join(__dirname, '..', '.env');
  let keys = { numverify: '', abstract: '' };
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const NVMatch = content.match(/NUMVERIFY_API_KEY=(.*)/);
    const ABSMatch = content.match(/ABSTRACT_API_KEY=(.*)/);
    if(NVMatch) keys.numverify = NVMatch[1].trim();
    if(ABSMatch) keys.abstract = ABSMatch[1].trim();
  }
  res.json(keys);
});

app.post('/api/settings', (req, res) => {
  const { numverify, abstract } = req.body;
  const envPath = path.join(__dirname, '..', '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  
  const updateKey = (key, value) => {
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  };

  updateKey('NUMVERIFY_API_KEY', numverify || '');
  updateKey('ABSTRACT_API_KEY', abstract || '');
  
  fs.writeFileSync(envPath, content.trim() + '\n');
  liveLogs.push('[SYSTEM] OSINT SECRETS SETTING OVERRIDE ACCEPTED');
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🚀 [openclaw] Spam-Numbers Dashboard: http://localhost:${PORT}`);
});
