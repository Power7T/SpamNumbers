#!/usr/bin/env node
'use strict';

/**
 * spam-numbers CLI entry point
 *
 * Usage:
 *   node index.js scrape              Run all scrapers now
 *   node index.js lookup <number>     Check if a number is in the spam database
 *   node index.js export [filename]   Export database to CSV
 *   node index.js schedule            Start the weekly auto-scheduler
 *   node index.js stats               Show database statistics
 */

const { getDb, closeDb } = require('./db/connection');
const { initSchema } = require('./db/schema');
const { lookupNumber, getStats } = require('./db/queries');
const { normalizePhone } = require('./normalizer');
const { runAll } = require('./orchestrator');
const { exportToCsv } = require('./exporter');
const { startScheduler } = require('./scheduler');

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught exception:', err.message);
  process.exit(1);
});

function printHelp() {
  console.log(`
spam-numbers — OpenClaw skill for collecting spam caller data

USAGE
  node index.js <command> [options]

COMMANDS
  scrape              Fetch fresh data from all 8 sources and store in DB
  lookup <number>     Check if a phone number is flagged as spam
  export [filename]   Export the full database to CSV
  schedule            Start the weekly auto-scheduler (long-running)
  stats               Show database statistics

EXAMPLES
  node index.js scrape
  node index.js lookup 8005551234
  node index.js lookup "+1 (800) 555-1234"
  node index.js export
  node index.js export my_spam_list.csv
  node index.js stats
  node index.js schedule
`);
}

function formatLookupResult(row, phone) {
  if (!row) {
    return `✅ ${phone} — Not found in spam database`;
  }

  const score = typeof row.spam_score === 'number'
    ? row.spam_score.toFixed(1)
    : '?';

  const lines = [
    `📵 ${row.phone_number} — SPAM CONFIRMED`,
    `  Score: ${score}/10 | Type: ${row.call_type} | Reports: ${row.report_count.toLocaleString()}`,
    `  Sources: ${row.sources || 'unknown'}`,
    `  First seen: ${(row.date_first_seen || '').slice(0, 10)} | Last updated: ${(row.date_last_updated || '').slice(0, 10)}`,
  ];

  if (row.user_notes && row.user_notes.trim()) {
    lines.push(`  Notes: ${row.user_notes.slice(0, 300)}`);
  }

  return lines.join('\n');
}

function printStats(stats) {
  console.log('\n=== Spam Numbers Database Statistics ===\n');
  console.log(`Total unique spam numbers: ${stats.total.toLocaleString()}`);

  if (stats.bySource.length > 0) {
    console.log('\nNumbers by source:');
    for (const { source, count } of stats.bySource) {
      console.log(`  ${source.padEnd(16)} ${count.toLocaleString()}`);
    }
  }

  if (stats.top10.length > 0) {
    console.log('\nTop 10 highest-score numbers:');
    for (const row of stats.top10) {
      const score = typeof row.spam_score === 'number'
        ? row.spam_score.toFixed(1)
        : '?';
      console.log(`  ${row.phone_number.padEnd(16)} score=${score}  type=${row.call_type}  reports=${row.report_count.toLocaleString()}`);
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

  console.log('');
}

async function main() {
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
        console.log(formatLookupResult(row, phone));
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
        // startScheduler never returns (keeps process alive via cron)
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
  }
}

main().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
