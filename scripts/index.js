#!/usr/bin/env node
'use strict';

/**
 * spam-numbers CLI entry point
 *
 * Usage:
 *   node index.js scrape              Run all scrapers now
 *   node index.js lookup <number>     Check if a number is in the spam database
 *   node index.js bulk <file>         Bulk lookup numbers from a file
 *   node index.js whitelist <number>  Mark a number as not-spam (false positive)
 *   node index.js unwhitelist <num>   Remove whitelist flag
 *   node index.js decay               Manually run stale data cleanup
 *   node index.js export [filename]   Export database to CSV
 *   node index.js schedule            Start the weekly auto-scheduler
 *   node index.js stats               Show database statistics
 */

const fs = require('fs');
const { getDb, closeDb } = require('./db/connection');
const { initSchema } = require('./db/schema');
const { lookupNumber, bulkLookup, whitelistNumber, unwhitelistNumber, decayStaleData, getStats } = require('./db/queries');
const { normalizePhone } = require('./normalizer');
const { runAll } = require('./orchestrator');
const { exportToCsv } = require('./exporter');
const { startScheduler } = require('./scheduler');
const { fetchText } = require('./scrapers/base');
const { closeStealthBrowser } = require('./lib/stealth-browser');

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught exception:', err.message);
  process.exit(1);
});

/**
 * Check SkipCalls free API as a fallback for numbers not in the local DB.
 */
async function checkSkipCallsApi(phone) {
  try {
    const digits = phone.replace('+', '');
    const url = `https://spam.skipcalls.app/check/${digits}`;
    const body = await fetchText(url, { timeout: 8000 });
    if (!body) return null;

    const data = JSON.parse(body);
    if (!data || data.spam === false || data.spam === undefined) return null;

    if (data.spam === true || data.isSpam === true || data.score > 0) {
      const score = data.score || data.spamScore || 'N/A';
      const type = data.type || data.category || 'unknown';
      const reports = data.reports || data.reportCount || 0;
      return [
        `📵 ${phone} — SPAM (via SkipCalls API)`,
        `  Score: ${score} | Type: ${type} | Reports: ${reports}`,
        `  Note: Not in local database. Run "node index.js scrape" to update.`,
      ].join('\n');
    }

    return null;
  } catch (_) {
    return null;
  }
}

function printHelp() {
  console.log(`
spam-numbers — Worldwide spam caller database

USAGE
  node index.js <command> [options]

COMMANDS
  scrape              Fetch data from all sources (parallel, with retries)
  lookup <number>     Check a phone number (local DB + online API fallback)
  bulk <file>         Bulk lookup: one number per line in file
  whitelist <number>  Mark number as not-spam (false positive)
  unwhitelist <num>   Remove whitelist flag
  decay               Manually run stale data cleanup (auto-runs after scrape)
  export [filename]   Export database to CSV
  schedule            Start weekly auto-scheduler (long-running)
  stats               Show database statistics + scraper health

EXAMPLES
  node index.js scrape
  node index.js lookup 8005551234
  node index.js lookup +442382280715
  node index.js bulk numbers.txt
  node index.js whitelist +18005551234
  node index.js stats
`);
}

const CONFIDENCE_ICONS = { high: '🔴', medium: '🟡', low: '🟢' };

function formatLookupResult(row, phone) {
  if (!row) {
    return `✅ ${phone} — Not found in spam database`;
  }

  const score = typeof row.weighted_score === 'number'
    ? row.weighted_score.toFixed(1)
    : (typeof row.spam_score === 'number' ? row.spam_score.toFixed(1) : '?');
  const rawScore = typeof row.spam_score === 'number' ? row.spam_score.toFixed(1) : '?';
  const conf = row.confidence || 'low';
  const icon = CONFIDENCE_ICONS[conf] || '';

  const lines = [
    `📵 ${row.phone_number} — SPAM ${icon} ${conf.toUpperCase()} CONFIDENCE`,
    `  Weighted: ${score}/10 | Raw: ${rawScore}/10 | Type: ${row.call_type}`,
    `  Reports: ${row.report_count.toLocaleString()} | Sources: ${row.source_count || '?'} (${row.sources || 'unknown'})`,
    `  Country: ${row.country} | First seen: ${(row.date_first_seen || '').slice(0, 10)} | Updated: ${(row.date_last_updated || '').slice(0, 10)}`,
  ];

  if (row.user_notes && row.user_notes.trim()) {
    lines.push(`  Notes: ${row.user_notes.slice(0, 300)}`);
  }

  return lines.join('\n');
}

function printStats(stats) {
  console.log('\n=== Spam Numbers Database Statistics ===\n');
  console.log(`Total spam numbers: ${stats.total.toLocaleString()}`);
  if (stats.whitelisted > 0) {
    console.log(`Whitelisted (false positives): ${stats.whitelisted}`);
  }

  if (stats.byConfidence && stats.byConfidence.length > 0) {
    console.log('\nBy confidence:');
    for (const { confidence, count } of stats.byConfidence) {
      const icon = CONFIDENCE_ICONS[confidence] || '';
      console.log(`  ${icon} ${confidence.padEnd(8)} ${count.toLocaleString()}`);
    }
  }

  if (stats.bySource.length > 0) {
    console.log('\nBy source:');
    for (const { source, count } of stats.bySource) {
      console.log(`  ${source.padEnd(16)} ${count.toLocaleString()}`);
    }
  }

  if (stats.byCountry && stats.byCountry.length > 0) {
    console.log('\nBy country:');
    for (const { country, count } of stats.byCountry) {
      console.log(`  ${country.padEnd(16)} ${count.toLocaleString()}`);
    }
  }

  if (stats.top10.length > 0) {
    console.log('\nTop 10 highest-score numbers:');
    for (const row of stats.top10) {
      const score = typeof row.weighted_score === 'number' ? row.weighted_score.toFixed(1) : '?';
      const conf = row.confidence || '?';
      console.log(`  ${row.phone_number.padEnd(18)} score=${score}  conf=${conf}  type=${row.call_type}  reports=${row.report_count.toLocaleString()}  country=${row.country}`);
    }
  }

  if (stats.lastRun) {
    const r = stats.lastRun;
    console.log('\nLast scrape run:');
    console.log(`  Started:  ${r.started_at}`);
    console.log(`  Finished: ${r.finished_at || 'in progress'}`);
    console.log(`  Status:   ${r.status}`);
    console.log(`  New:      ${r.total_new}  Updated: ${r.total_updated}`);
    if (r.errors && r.errors !== '[]') {
      const errs = JSON.parse(r.errors);
      if (errs.length > 0) {
        console.log(`  Errors:   ${errs.map(e => `${e.source}: ${e.message}`).join('; ')}`);
      }
    }
  } else {
    console.log('\nNo scrape runs recorded yet. Run: node index.js scrape');
  }

  if (stats.health && stats.health.length > 0) {
    console.log('\nScraper health:');
    for (const h of stats.health) {
      const status = h.consecutive_zeros >= 3 ? '⚠ WARN' : h.consecutive_zeros >= 1 ? '~ OK' : '✓ OK';
      console.log(`  ${h.source.padEnd(16)} last=${h.last_count} records  runs=${h.total_runs}  ${status}`);
    }
  }

  console.log('');
}

async function main() {
  // Check for Chromium installation (crucial for Puppeteer stealth scrapers on Ubuntu VPS)
  if (!fs.existsSync('/usr/bin/chromium-browser') && !fs.existsSync('/usr/bin/chromium')) {
    console.warn('\n======================================================');
    console.warn('⚠️  WARNING: Chromium browser not found on this system!');
    console.warn('⚠️  Puppeteer stealth scrapers may fail to run.');
    console.warn('⚠️  To install on Ubuntu, run: sudo apt install -y chromium-browser');
    console.warn('======================================================\n');
  }

  const [, , command, ...args] = process.argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    process.exit(0);
  }

  // Initialize database
  const db = getDb();
  initSchema(db);

  try {
    switch (command) {
      case 'scrape': {
        await runAll(db);
        break;
      }

      case 'lookup': {
        const rawInput = args.join(' ').trim();
        if (!rawInput) {
          console.error('Usage: node index.js lookup <phone_number>');
          process.exit(1);
        }
        const phone = normalizePhone(rawInput);
        if (!phone) {
          console.error(`Could not parse "${rawInput}" as a valid phone number`);
          process.exit(1);
        }
        const row = lookupNumber(db, phone);
        if (row) {
          console.log(formatLookupResult(row, phone));
        } else {
          const apiResult = await checkSkipCallsApi(phone);
          if (apiResult) {
            console.log(apiResult);
          } else {
            console.log(formatLookupResult(null, phone));
          }
        }
        break;
      }

      case 'bulk': {
        const filePath = args[0];
        if (!filePath || !fs.existsSync(filePath)) {
          console.error('Usage: node index.js bulk <file>');
          console.error('File should contain one phone number per line.');
          process.exit(1);
        }
        const lines = fs.readFileSync(filePath, 'utf8')
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);

        const phones = lines.map(normalizePhone).filter(Boolean);
        console.log(`Checking ${phones.length} numbers...\n`);

        const results = bulkLookup(db, phones);
        let spamCount = 0;
        for (const { phone_number, found, row } of results) {
          if (found) {
            spamCount++;
            const score = row.weighted_score ? row.weighted_score.toFixed(1) : '?';
            console.log(`📵 ${phone_number}  score=${score}  type=${row.call_type}  conf=${row.confidence}`);
          } else {
            console.log(`✅ ${phone_number}  — clean`);
          }
        }
        console.log(`\n${spamCount}/${phones.length} numbers flagged as spam`);
        break;
      }

      case 'whitelist': {
        const rawInput = args.join(' ').trim();
        if (!rawInput) {
          console.error('Usage: node index.js whitelist <phone_number>');
          process.exit(1);
        }
        const phone = normalizePhone(rawInput);
        if (!phone) {
          console.error(`Could not parse "${rawInput}" as a valid phone number`);
          process.exit(1);
        }
        const ok = whitelistNumber(db, phone);
        console.log(ok
          ? `✅ ${phone} whitelisted — will be excluded from lookups and exports`
          : `${phone} not found in database`
        );
        break;
      }

      case 'unwhitelist': {
        const rawInput = args.join(' ').trim();
        if (!rawInput) {
          console.error('Usage: node index.js unwhitelist <phone_number>');
          process.exit(1);
        }
        const phone = normalizePhone(rawInput);
        if (!phone) {
          console.error(`Could not parse "${rawInput}" as a valid phone number`);
          process.exit(1);
        }
        const ok = unwhitelistNumber(db, phone);
        console.log(ok
          ? `📵 ${phone} removed from whitelist`
          : `${phone} not found in database`
        );
        break;
      }

      case 'decay': {
        console.log('Running stale data cleanup...');
        const { decayed, deleted } = decayStaleData(db);
        console.log(`Done: ${decayed} scores decayed, ${deleted} stale entries removed`);
        break;
      }

      case 'export': {
        const customPath = args[0] || null;
        const outPath = exportToCsv(db, customPath);
        console.log(`CSV exported to: ${outPath}`);
        break;
      }

      case 'schedule': {
        await startScheduler(db);
        return;
      }

      case 'stats': {
        const stats = getStats(db);
        printStats(stats);
        break;
      }

      default: {
        console.error(`Unknown command: "${command}"`);
        printHelp();
        process.exit(1);
      }
    }
  } finally {
    if (command !== 'schedule') {
      closeDb();
    }
    await closeStealthBrowser();
  }
}

main().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
