'use strict';

const { scrapeFtc } = require('./scrapers/ftc');
const { scrapeEightHundredNotes } = require('./scrapers/eightHundredNotes');
const { scrapeShouldIAnswer } = require('./scrapers/shouldIAnswer');
const { scrapeSpamCalls } = require('./scrapers/spamCalls');
const { scrapeYoumail } = require('./scrapers/youmail');
const { scrapeSkipCalls } = require('./scrapers/skipCalls');
const { scrapeWhoCallsMe } = require('./scrapers/whoCallsMe');
const { scrapeGithubLists } = require('./scrapers/githubLists');
const { upsertFromScraper, insertRunLog, finalizeRunLog, updateScraperHealth, decayStaleData } = require('./db/queries');
const { sleep } = require('./scrapers/base');

const SCRAPERS = [
  // US Sources
  { name: 'ftc',           fn: scrapeFtc },
  { name: '800notes',      fn: scrapeEightHundredNotes },
  { name: 'shouldianswer', fn: scrapeShouldIAnswer },
  { name: 'spamcalls',     fn: scrapeSpamCalls },
  { name: 'youmail',       fn: scrapeYoumail },
  { name: 'skipcalls',     fn: scrapeSkipCalls },
  { name: 'whocallsme',    fn: scrapeWhoCallsMe },
  // International (GitHub: US + UK + France/EU blocklists)
  { name: 'github',        fn: scrapeGithubLists },
];

// Scrapers that can safely run in parallel (no shared rate limits)
const PARALLEL_GROUP_1 = ['ftc', 'github'];  // API + file download
const PARALLEL_GROUP_2 = ['800notes', 'shouldianswer', 'youmail'];
const PARALLEL_GROUP_3 = ['spamcalls', 'skipcalls', 'whocallsme'];

const MAX_RETRIES = 2;
const RETRY_DELAYS = [2000, 5000]; // 2s, 5s backoff

/**
 * Run a single scraper with retry logic.
 */
async function runScraperWithRetry(name, fn) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[orchestrator]   ↻ ${name} retry #${attempt}`);
        await sleep(RETRY_DELAYS[attempt - 1]);
      }
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        console.warn(`[orchestrator]   ⚠ ${name} attempt ${attempt + 1} failed: ${err.message}`);
      }
    }
  }
  throw lastError;
}

/**
 * Run a group of scrapers in parallel, process their results.
 */
async function runGroup(db, scraperNames, allScrapers, errors) {
  const group = allScrapers.filter(s => scraperNames.includes(s.name));
  if (group.length === 0) return { newCount: 0, updatedCount: 0 };

  let totalNew = 0;
  let totalUpdated = 0;

  const results = await Promise.allSettled(
    group.map(async ({ name, fn }) => {
      console.log(`[orchestrator] ▶ ${name}`);
      const records = await runScraperWithRetry(name, fn);
      return { name, records };
    })
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      const name = 'unknown';
      console.error(`[orchestrator] ✗ scraper FAILED: ${result.reason.message}\n`);
      errors.push({ source: name, message: result.reason.message });
      continue;
    }

    const { name, records } = result.value;
    let newFromSource = 0;
    let updatedFromSource = 0;

    for (const record of records) {
      try {
        const { isNew } = upsertFromScraper(db, record);
        if (isNew) { newFromSource++; totalNew++; }
        else { updatedFromSource++; totalUpdated++; }
      } catch (dbErr) {
        errors.push({ source: name, message: dbErr.message });
        break;
      }
    }

    // Track scraper health
    updateScraperHealth(db, name, records.length);

    // Warn if scraper returned 0 records
    if (records.length === 0) {
      console.warn(`[orchestrator] ⚠ ${name}: 0 records (source may be down or blocked)\n`);
    } else {
      console.log(`[orchestrator] ✓ ${name}: ${records.length} records (${newFromSource} new, ${updatedFromSource} updated)\n`);
    }
  }

  return { newCount: totalNew, updatedCount: totalUpdated };
}

/**
 * Run all scrapers with parallel groups and retry logic.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {object} options - { parallel: true } for parallel mode
 * @returns {Promise<{totalNew, totalUpdated, errors}>}
 */
async function runAll(db, options = {}) {
  const runId = insertRunLog(db);
  const errors = [];
  let totalNew = 0;
  let totalUpdated = 0;

  const useParallel = options.parallel !== false;

  console.log(`\n[orchestrator] Starting scrape run #${runId} — ${new Date().toISOString()}`);
  console.log(`[orchestrator] Running ${SCRAPERS.length} scrapers ${useParallel ? '(parallel groups)' : '(sequential)'}\n`);

  if (useParallel) {
    // Run in parallel groups to balance speed vs rate limiting
    for (const groupNames of [PARALLEL_GROUP_1, PARALLEL_GROUP_2, PARALLEL_GROUP_3]) {
      const { newCount, updatedCount } = await runGroup(db, groupNames, SCRAPERS, errors);
      totalNew += newCount;
      totalUpdated += updatedCount;
    }
  } else {
    // Sequential fallback
    for (const { name, fn } of SCRAPERS) {
      try {
        console.log(`[orchestrator] ▶ ${name}`);
        const records = await runScraperWithRetry(name, fn);
        let newFromSource = 0;
        let updatedFromSource = 0;

        for (const record of records) {
          try {
            const { isNew } = upsertFromScraper(db, record);
            if (isNew) { newFromSource++; totalNew++; }
            else { updatedFromSource++; totalUpdated++; }
          } catch (dbErr) {
            throw dbErr;
          }
        }

        updateScraperHealth(db, name, records.length);
        console.log(`[orchestrator] ✓ ${name}: ${records.length} records (${newFromSource} new, ${updatedFromSource} updated)\n`);
      } catch (err) {
        console.error(`[orchestrator] ✗ ${name} FAILED: ${err.message}\n`);
        errors.push({ source: name, message: err.message });
        updateScraperHealth(db, name, 0);
      }
    }
  }

  // Run stale data decay after scraping
  console.log('[orchestrator] Running stale data decay...');
  const { decayed, deleted } = decayStaleData(db);
  if (decayed > 0 || deleted > 0) {
    console.log(`[orchestrator] Decay: ${decayed} scores reduced, ${deleted} entries removed\n`);
  }

  finalizeRunLog(db, runId, { totalNew, totalUpdated, errors });

  // Print health warnings
  const healthWarnings = db.prepare(
    'SELECT source, consecutive_zeros FROM scraper_health WHERE consecutive_zeros >= 3'
  ).all();
  if (healthWarnings.length > 0) {
    console.log('[orchestrator] ⚠ HEALTH WARNINGS:');
    for (const { source, consecutive_zeros } of healthWarnings) {
      console.log(`  ${source}: returned 0 records for ${consecutive_zeros} consecutive runs — may be broken`);
    }
    console.log('');
  }

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
