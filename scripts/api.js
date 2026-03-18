'use strict';
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const Database = require('better-sqlite3');
const path = require('path');
const { getStats, lookupNumber, getAllNumbers } = require('./db/queries');

const app = express();
const PORT = process.env.PORT || 3000;
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

app.listen(PORT, () => {
  console.log(`🚀 [openclaw] Spam-Numbers Dashboard: http://localhost:${PORT}`);
});
