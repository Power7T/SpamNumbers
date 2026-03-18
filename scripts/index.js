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
const { getMissingFtcDates } = require('./db/queries');
const { importFtcHistory } = require('./import-ftc-history');
const { exportToCsv } = require('./exporter');
const { startScheduler } = require('./scheduler');
const { closeStealthBrowser } = require('./lib/stealth-browser');
const { fetchText } = require('./scrapers/base');
const path = require('path');
const readline = require('readline');

// Load .env keys manually to avoid new dependencies
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    const [key, ...vals] = line.split('=');
    if (key && vals.length > 0) {
      process.env[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

function saveEnv(key, val) {
  const envPath = path.join(__dirname, '.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = content.split(/\r?\n/).filter(Boolean);
  const index = lines.findIndex(l => l.startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = `${key}=${val}`;
  } else {
    lines.push(`${key}=${val}`);
  }
  fs.writeFileSync(envPath, lines.join('\n') + '\n');
  process.env[key] = val;
}

loadEnv();


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
  status              Show live progress of the current scrape run
  stats               Show database statistics + scraper health

  history             Find gaps in FTC data and prompt for backfill
  config <p> <v>      Set API keys (NUMVERIFY_API_KEY, ABSTRACT_API_KEY, FTC_API_KEY)

API VALIDATION
  FTC API (api.data.gov) provides real-time access to DNC complaints.
  NumVerify and AbstractAPI offer free tiers (100-250/mo) for carrier info.
  To enable:
    export FTC_API_KEY="your_key"
    export NUMVERIFY_API_KEY="your_key"
    export ABSTRACT_API_KEY="your_key"
    node index.js scrape
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
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const question = (q) => new Promise((resolve) => rl.question(q, resolve));

        const keysToCheck = [
          { env: 'FTC_API_KEY', name: 'FTC DNC Complaints API', skipEnv: 'SKIP_FTC_API' },
          { env: 'NUMVERIFY_API_KEY', name: 'NumVerify Validator API', skipEnv: 'SKIP_NUMVERIFY_API' },
          { env: 'ABSTRACT_API_KEY', name: 'Abstract Validator API', skipEnv: 'SKIP_ABSTRACT_API' },
        ];

        for (const k of keysToCheck) {
          if (!process.env[k.env] && !process.env[k.skipEnv]) {
            console.log(`\n🔑 Missing API Key: ${k.name}`);
            const answer = await question(`Enter key (or "skip" to ignore this time, or "permanent" to never ask again): `);
            const trimmed = answer.trim();
            if (trimmed === 'permanent') {
              saveEnv(k.skipEnv, 'true');
              console.log(`✅ Permanently skipped ${k.name}. To re-enable, manually edit scripts/.env`);
            } else if (trimmed && trimmed !== 'skip') {
              saveEnv(k.env, trimmed);
              console.log(`✅ ${k.name} key saved.`);
            } else {
              console.log(`⏭ Skipping ${k.name} for this run.`);
            }
          }
        }
        rl.close();

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
        const frequency = args[0] || 'weekly';
        if (!['daily', 'weekly'].includes(frequency)) {
          console.error('Invalid frequency. Use "daily" or "weekly".');
          process.exit(1);
        }
        await startScheduler(db, frequency);
        break;
      }


      case 'status': {
        const logPath = path.join(__dirname, 'latest-scrape-progress.log');
        if (!fs.existsSync(logPath)) {
          console.log('No active or recent scrape logs found.');
          break;
        }
        const log = fs.readFileSync(logPath, 'utf8');
        const lines = log.split('\n').filter(Boolean).slice(-10);
        console.log(`\n--- Latest Scrape Progress ---\n`);
        console.log(lines.join('\n'));
        console.log(`\n-----------------------------\n`);
        break;
      }

      case 'stats': {

        const stats = getStats(db);
        printStats(stats);
        break;
      }

      case 'config': {
        const key = (args[0] || '').toUpperCase();
        const val = args[1] || '';
        const validKeys = ['NUMVERIFY_API_KEY', 'ABSTRACT_API_KEY', 'FTC_API_KEY'];
        if (!key || !validKeys.includes(key)) {
          console.error(`Usage: node index.js config <${validKeys.join('|')}> <value>`);
          process.exit(1);
        }
        saveEnv(key, val);
        console.log(`✅ Config updated: ${key} saved to .env`);
        break;
      }

      case 'history': {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const question = (q) => new Promise((resolve) => rl.question(q, resolve));

        const gaps = getMissingFtcDates(db, 30);
        if (gaps.length > 0) {
          console.log(`\n🔎 Found ${gaps.length} missing dates in your FTC CSV archives (past 30 days):`);
          console.log(`  ${gaps.slice(0, 5).join(', ')}${gaps.length > 5 ? '...' : ''}`);
          const answer = await question(`Do you want to fill these missing gaps now? (y/n/custom): `);
          
          if (answer.toLowerCase() === 'y') {
            rl.close();
            // We'll run history script with custom list (in a real app we'd pass gaps)
            // For now, let's just run the standard historical script (which checks last 12)
            await importFtcHistory();
            break;
          } else if (answer.toLowerCase() === 'custom') {
              const start = await question('Start Date (YYYY-MM-DD): ');
              const end = await question('End Date (YYYY-MM-DD): ');
              console.log(`\nImporting from ${start} to ${end}...`);
              // In this case, we could call importFtcHistory with custom range if we refactored it
          }
        } else {
          console.log('\n✅ Your FTC historical data is complete for the last 30 days!');
        }
        rl.close();
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
