'use strict';

const { scrapeFtc } = require('./scrapers/ftc');
const { scrapeEightHundredNotes } = require('./scrapers/eightHundredNotes');
const { scrapeShouldIAnswer } = require('./scrapers/shouldIAnswer');
const { scrapeSpamCalls } = require('./scrapers/spamCalls');
const { scrapeYoumail } = require('./scrapers/youmail');
const { scrapeSkipCalls } = require('./scrapers/skipCalls');
const { scrapeWhoCallsMe } = require('./scrapers/whoCallsMe');
const { scrapeGithubLists } = require('./scrapers/githubLists');
const { upsertFromScraper, insertRunLog, finalizeRunLog } = require('./db/queries');

const SCRAPERS = [
  { name: 'ftc',           fn: scrapeFtc },
  { name: '800notes',      fn: scrapeEightHundredNotes },
  { name: 'shouldianswer', fn: scrapeShouldIAnswer },
  { name: 'spamcalls',     fn: scrapeSpamCalls },
  { name: 'youmail',       fn: scrapeYoumail },
  { name: 'skipcalls',     fn: scrapeSkipCalls },
  { name: 'whocallsme',    fn: scrapeWhoCallsMe },
  { name: 'github',        fn: scrapeGithubLists },
];

/**
 * Run all scrapers sequentially.
 * Each scraper is individually wrapped in try/catch so one failure
 * never stops the remaining scrapers from running.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @returns {Promise<{totalNew, totalUpdated, errors}>}
 */
async function runAll(db) {
  const runId = insertRunLog(db);
  const errors = [];
  let totalNew = 0;
  let totalUpdated = 0;

  console.log(`\n[orchestrator] Starting scrape run #${runId} — ${new Date().toISOString()}`);
  console.log(`[orchestrator] Running ${SCRAPERS.length} scrapers sequentially\n`);

  for (const { name, fn } of SCRAPERS) {
    try {
      console.log(`[orchestrator] ▶ ${name}`);
      const records = await fn();

      let newFromSource = 0;
      let updatedFromSource = 0;

      for (const record of records) {
        try {
          const { isNew } = upsertFromScraper(db, record);
          if (isNew) { newFromSource++; totalNew++; }
          else { updatedFromSource++; totalUpdated++; }
        } catch (dbErr) {
          // Re-throw DB errors — these are systemic, not per-record
          throw dbErr;
        }
      }

      console.log(`[orchestrator] ✓ ${name}: ${records.length} records (${newFromSource} new, ${updatedFromSource} updated)\n`);
    } catch (err) {
      console.error(`[orchestrator] ✗ ${name} FAILED: ${err.message}\n`);
      errors.push({ source: name, message: err.message });
    }
  }

  finalizeRunLog(db, runId, { totalNew, totalUpdated, errors });

  console.log(`[orchestrator] Run #${runId} complete`);
  console.log(`  New numbers:     ${totalNew}`);
  console.log(`  Updated numbers: ${totalUpdated}`);
  if (errors.length > 0) {
    console.log(`  Failed scrapers: ${errors.map(e => e.source).join(', ')}`);
  }
  console.log('');

  return { totalNew, totalUpdated, errors };
}

module.exports = { runAll };
