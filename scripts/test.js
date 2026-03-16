#!/usr/bin/env node
'use strict';

/**
 * Test suite for spam-numbers
 * Run: node test.js
 * No external test framework needed — uses Node.js assert.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function getTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const { initSchema } = require('./db/schema');
  initSchema(db);
  return db;
}

// ============================================
// NORMALIZER TESTS
// ============================================
console.log('\n=== Normalizer Tests ===\n');

const { normalizePhone, normalizeScore, scoreFromCount, normalizeCallType } = require('./normalizer');

test('normalizePhone: US 10-digit', () => {
  assert.strictEqual(normalizePhone('8005551234'), '+18005551234');
});

test('normalizePhone: US with +1', () => {
  assert.strictEqual(normalizePhone('+18005551234'), '+18005551234');
});

test('normalizePhone: US with formatting', () => {
  assert.strictEqual(normalizePhone('(800) 555-1234'), '+18005551234');
});

test('normalizePhone: UK number', () => {
  assert.strictEqual(normalizePhone('+442382280715'), '+442382280715');
});

test('normalizePhone: French number', () => {
  assert.strictEqual(normalizePhone('+33178569561'), '+33178569561');
});

test('normalizePhone: Indian number', () => {
  assert.strictEqual(normalizePhone('+919876543210'), '+919876543210');
});

test('normalizePhone: Australian number', () => {
  assert.strictEqual(normalizePhone('+61212345678'), '+61212345678');
});

test('normalizePhone: German number', () => {
  assert.strictEqual(normalizePhone('+4930123456'), '+4930123456');
});

test('normalizePhone: bare international digits', () => {
  assert.strictEqual(normalizePhone('442382280715'), '+442382280715');
});

test('normalizePhone: with country hint GB', () => {
  assert.strictEqual(normalizePhone('02382280715', 'GB'), '+442382280715');
});

test('normalizePhone: null for empty', () => {
  assert.strictEqual(normalizePhone(''), null);
  assert.strictEqual(normalizePhone(null), null);
});

test('normalizePhone: null for short number', () => {
  assert.strictEqual(normalizePhone('123'), null);
});

test('normalizeScore: basic scaling', () => {
  assert.strictEqual(normalizeScore(5, 10), 5);
  assert.strictEqual(normalizeScore(10, 10), 10);
  assert.strictEqual(normalizeScore(3, 5), 6);
});

test('normalizeScore: clamped to 10', () => {
  assert.strictEqual(normalizeScore(20, 10), 10);
});

test('normalizeScore: null returns 0', () => {
  assert.strictEqual(normalizeScore(null), 0);
});

test('scoreFromCount: logarithmic scale', () => {
  assert.ok(scoreFromCount(1) < 2);
  assert.ok(scoreFromCount(10) > 4 && scoreFromCount(10) < 6);
  assert.ok(scoreFromCount(100) >= 9);
});

test('normalizeCallType: robocall variants', () => {
  assert.strictEqual(normalizeCallType('robocall'), 'robocall');
  assert.strictEqual(normalizeCallType('Recorded Message'), 'robocall');
  assert.strictEqual(normalizeCallType('auto-dialer'), 'robocall');
});

test('normalizeCallType: scam variants', () => {
  assert.strictEqual(normalizeCallType('scam call'), 'scam');
  assert.strictEqual(normalizeCallType('fraud'), 'scam');
  assert.strictEqual(normalizeCallType('IRS scam'), 'scam');
});

test('normalizeCallType: unknown returns other', () => {
  assert.strictEqual(normalizeCallType('something weird'), 'other');
  assert.strictEqual(normalizeCallType(null), 'other');
});

// ============================================
// DATABASE QUERY TESTS
// ============================================
console.log('\n=== Database Query Tests ===\n');

const { upsertFromScraper, lookupNumber, bulkLookup, whitelistNumber, unwhitelistNumber, decayStaleData, getStats, updateScraperHealth, SOURCE_WEIGHTS } = require('./db/queries');

test('upsertFromScraper: insert new record', () => {
  const db = getTestDb();
  const { isNew } = upsertFromScraper(db, {
    phone_number: '+18005551234',
    source: 'ftc',
    spam_score: 8,
    call_type: 'robocall',
    country: 'US',
    report_count: 5,
    user_notes: 'Test note',
  });
  assert.strictEqual(isNew, true);

  const row = lookupNumber(db, '+18005551234');
  assert.ok(row);
  assert.strictEqual(row.phone_number, '+18005551234');
  assert.strictEqual(row.call_type, 'robocall');
  db.close();
});

test('upsertFromScraper: update existing record', () => {
  const db = getTestDb();
  upsertFromScraper(db, {
    phone_number: '+18005551234',
    source: 'ftc',
    spam_score: 6,
    report_count: 3,
  });
  const { isNew } = upsertFromScraper(db, {
    phone_number: '+18005551234',
    source: '800notes',
    spam_score: 9,
    report_count: 10,
  });
  assert.strictEqual(isNew, false);

  const row = lookupNumber(db, '+18005551234');
  assert.ok(row.spam_score >= 9);       // MAX of sources
  assert.ok(row.report_count >= 13);    // SUM of sources
  assert.ok(row.source_count >= 2);     // two sources
  db.close();
});

test('upsertFromScraper: weighted score uses source weights', () => {
  const db = getTestDb();
  upsertFromScraper(db, {
    phone_number: '+18005559999',
    source: 'ftc',
    spam_score: 8,
    report_count: 10,
  });
  upsertFromScraper(db, {
    phone_number: '+18005559999',
    source: 'github',
    spam_score: 5,
    report_count: 1,
  });

  const row = lookupNumber(db, '+18005559999');
  assert.ok(row.weighted_score > 0);
  // FTC weight (1.0) > github weight (0.4), so weighted should lean toward FTC's 8
  assert.ok(row.weighted_score > 5, `weighted_score ${row.weighted_score} should be > 5`);
  db.close();
});

test('confidence: low for single source', () => {
  const db = getTestDb();
  upsertFromScraper(db, {
    phone_number: '+18001111111',
    source: 'github',
    spam_score: 5,
    report_count: 1,
  });
  const row = lookupNumber(db, '+18001111111');
  assert.strictEqual(row.confidence, 'low');
  db.close();
});

test('confidence: medium for 2 sources', () => {
  const db = getTestDb();
  upsertFromScraper(db, { phone_number: '+18002222222', source: 'ftc', spam_score: 7, report_count: 5 });
  upsertFromScraper(db, { phone_number: '+18002222222', source: '800notes', spam_score: 6, report_count: 5 });
  const row = lookupNumber(db, '+18002222222');
  assert.strictEqual(row.confidence, 'medium');
  db.close();
});

test('confidence: high for 3+ sources', () => {
  const db = getTestDb();
  upsertFromScraper(db, { phone_number: '+18003333333', source: 'ftc', spam_score: 9, report_count: 20 });
  upsertFromScraper(db, { phone_number: '+18003333333', source: '800notes', spam_score: 8, report_count: 15 });
  upsertFromScraper(db, { phone_number: '+18003333333', source: 'youmail', spam_score: 7, report_count: 10 });
  const row = lookupNumber(db, '+18003333333');
  assert.strictEqual(row.confidence, 'high');
  db.close();
});

test('bulkLookup: returns results for multiple numbers', () => {
  const db = getTestDb();
  upsertFromScraper(db, { phone_number: '+18001111111', source: 'ftc', spam_score: 8 });
  upsertFromScraper(db, { phone_number: '+18002222222', source: 'ftc', spam_score: 7 });

  const results = bulkLookup(db, ['+18001111111', '+18002222222', '+18009999999']);
  assert.strictEqual(results.length, 3);
  assert.strictEqual(results[0].found, true);
  assert.strictEqual(results[1].found, true);
  assert.strictEqual(results[2].found, false);
  db.close();
});

test('whitelist: excludes number from lookups', () => {
  const db = getTestDb();
  upsertFromScraper(db, { phone_number: '+18005550000', source: 'ftc', spam_score: 8 });
  assert.ok(lookupNumber(db, '+18005550000'));

  whitelistNumber(db, '+18005550000');
  assert.strictEqual(lookupNumber(db, '+18005550000'), null);

  unwhitelistNumber(db, '+18005550000');
  assert.ok(lookupNumber(db, '+18005550000'));
  db.close();
});

test('decayStaleData: decays old entries', () => {
  const db = getTestDb();
  // Insert a number with old timestamp
  const oldDate = new Date(Date.now() - 200 * 86400000).toISOString();
  upsertFromScraper(db, {
    phone_number: '+18005550001',
    source: 'ftc',
    spam_score: 6,
    date_first_seen: oldDate,
  });
  // Manually backdate the update time
  db.prepare("UPDATE spam_numbers SET date_last_updated = ? WHERE phone_number = ?")
    .run(oldDate, '+18005550001');

  const before = lookupNumber(db, '+18005550001');
  assert.ok(before.spam_score >= 6);

  const { decayed } = decayStaleData(db, 180, 0.5, 1.0);
  assert.ok(decayed >= 1);

  const after = lookupNumber(db, '+18005550001');
  assert.ok(after.spam_score < before.spam_score, 'Score should have decayed');
  db.close();
});

test('updateScraperHealth: tracks scraper runs', () => {
  const db = getTestDb();
  updateScraperHealth(db, 'ftc', 100);
  updateScraperHealth(db, 'ftc', 0);
  updateScraperHealth(db, 'ftc', 0);

  const health = db.prepare('SELECT * FROM scraper_health WHERE source = ?').get('ftc');
  assert.strictEqual(health.total_runs, 3);
  assert.strictEqual(health.consecutive_zeros, 2);
  assert.strictEqual(health.last_count, 0);
  db.close();
});

test('getStats: returns full statistics', () => {
  const db = getTestDb();
  upsertFromScraper(db, { phone_number: '+18001111111', source: 'ftc', spam_score: 8, country: 'US' });
  upsertFromScraper(db, { phone_number: '+442382280715', source: 'github', spam_score: 5, country: 'UK' });

  const stats = getStats(db);
  assert.strictEqual(stats.total, 2);
  assert.ok(stats.bySource.length >= 2);
  assert.ok(stats.byCountry.length >= 2);
  assert.ok(stats.byConfidence.length >= 1);
  db.close();
});

test('SOURCE_WEIGHTS: government sources weighted highest', () => {
  assert.ok(SOURCE_WEIGHTS.ftc > SOURCE_WEIGHTS.github);
  assert.ok(SOURCE_WEIGHTS.ftc >= SOURCE_WEIGHTS['800notes']);
});

// ============================================
// RESULTS
// ============================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const { name, error } of failures) {
    console.log(`  ✗ ${name}: ${error}`);
  }
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
