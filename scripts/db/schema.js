'use strict';

const DDL = `
CREATE TABLE IF NOT EXISTS spam_numbers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number      TEXT    NOT NULL UNIQUE,
    spam_score        REAL    NOT NULL DEFAULT 0,
    call_type         TEXT    NOT NULL DEFAULT 'other',
    country           TEXT    NOT NULL DEFAULT 'US',
    report_count      INTEGER NOT NULL DEFAULT 0,
    user_notes        TEXT             DEFAULT '',
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

CREATE INDEX IF NOT EXISTS idx_sn_phone   ON spam_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_sn_score   ON spam_numbers(spam_score DESC);
CREATE INDEX IF NOT EXISTS idx_sn_updated ON spam_numbers(date_last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_ss_phone   ON spam_sources(phone_number);
`;

function initSchema(db) {
  db.exec(DDL);
}

module.exports = { initSchema };
