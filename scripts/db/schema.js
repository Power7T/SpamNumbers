'use strict';

const DDL = `
CREATE TABLE IF NOT EXISTS spam_numbers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number      TEXT    NOT NULL UNIQUE,
    spam_score        REAL    NOT NULL DEFAULT 0,
    weighted_score    REAL    NOT NULL DEFAULT 0,
    confidence        TEXT    NOT NULL DEFAULT 'low',
    source_count      INTEGER NOT NULL DEFAULT 0,
    call_type         TEXT    NOT NULL DEFAULT 'other',
    country           TEXT    NOT NULL DEFAULT 'US',
    report_count      INTEGER NOT NULL DEFAULT 0,
    user_notes        TEXT             DEFAULT '',
    is_whitelisted    INTEGER NOT NULL DEFAULT 0,
    date_first_seen   TEXT    NOT NULL,
    date_last_updated TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS spam_sources (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT    NOT NULL,
    source       TEXT    NOT NULL,
    spam_score   REAL             DEFAULT 0,
    report_count INTEGER          DEFAULT 0,
    user_notes   TEXT             DEFAULT '',
    call_type    TEXT             DEFAULT 'other',
    raw_data     TEXT             DEFAULT '',
    scraped_at   TEXT    NOT NULL,
    UNIQUE(phone_number, source),
    FOREIGN KEY(phone_number) REFERENCES spam_numbers(phone_number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scrape_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at    TEXT    NOT NULL,
    finished_at   TEXT,
    status        TEXT    NOT NULL DEFAULT 'running',
    total_new     INTEGER          DEFAULT 0,
    total_updated INTEGER          DEFAULT 0,
    errors        TEXT             DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS scraper_health (
    source        TEXT    NOT NULL,
    last_run_at   TEXT    NOT NULL,
    last_count    INTEGER NOT NULL DEFAULT 0,
    consecutive_zeros INTEGER NOT NULL DEFAULT 0,
    total_runs    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(source)
);

CREATE INDEX IF NOT EXISTS idx_sn_phone   ON spam_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_sn_score   ON spam_numbers(spam_score DESC);
CREATE INDEX IF NOT EXISTS idx_sn_updated ON spam_numbers(date_last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_sn_country ON spam_numbers(country);
CREATE INDEX IF NOT EXISTS idx_sn_whitelist ON spam_numbers(is_whitelisted);
CREATE INDEX IF NOT EXISTS idx_ss_phone   ON spam_sources(phone_number);
`;

// Migration: add new columns to existing databases
const MIGRATIONS = [
  `ALTER TABLE spam_numbers ADD COLUMN weighted_score REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE spam_numbers ADD COLUMN confidence TEXT NOT NULL DEFAULT 'low'`,
  `ALTER TABLE spam_numbers ADD COLUMN source_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE spam_numbers ADD COLUMN is_whitelisted INTEGER NOT NULL DEFAULT 0`,
];

function initSchema(db) {
  db.exec(DDL);

  // Run migrations for existing databases (ignore if columns already exist)
  for (const sql of MIGRATIONS) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  }
}

module.exports = { initSchema };
