'use strict';

const { scrapeSpamCalls } = require('./scrapers/spamCalls');
const { scrapeGithubLists } = require('./scrapers/githubLists');
const { scrapeNomoroboList } = require('./scrapers/nomoroboList');
const { scrapeTellows } = require('./scrapers/tellows');
const { scrapeSyncMe } = require('./scrapers/syncme');
const { scrapeValidators } = require('./scrapers/validatorApis');
const { hunt } = require('./scrapers/webHunter');
const { scrapeForums } = require('./scrapers/forumLists');
const { scrapeYouMail } = require('./scrapers/youmail');
const { scrapeShouldIAnswer } = require('./scrapers/shouldianswer');
const { scrapeInternational } = require('./scrapers/international');
const { scrapeSocialOSINT } = require('./scrapers/twitterScraper');
const { runHistoricalCrawl } = require('./scrapers/archiveCrawler');
const { scrapeGistFeed } = require('./scrapers/gistHunter');
const { scrapeBBB } = require('./scrapers/bbbScraper');
const { upsertFromScraper, upsertManyFromScraper, insertRunLog, finalizeRunLog, updateScraperHealth, decayStaleData } = require('./db/queries');
const { sleep } = require('./scrapers/base');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'latest-scrape-progress.log');

function logToFile(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}


const SCRAPERS = [
  { name: 'github',        fn: (db) => scrapeGithubLists() },
  { name: 'spamcalls',     fn: (db) => scrapeSpamCalls() },
  { name: 'tellows',       fn: (db) => scrapeTellows() },
  { name: 'syncme',        fn: (db) => scrapeSyncMe() },
  { name: 'validators',   fn: (db) => scrapeValidators(db) },
  { name: 'nomorobolist',  fn: (db) => scrapeNomoroboList() },
  { name: 'forums',        fn: (db) => scrapeForums() },
  { name: 'shouldianswer', fn: (db) => scrapeShouldIAnswer() },
  { name: 'international', fn: (db) => scrapeInternational() },
  { name: 'social_hunter', fn: (db) => scrapeSocialOSINT() },
  { name: 'gist_hunter',   fn: (db) => scrapeGistFeed() },
  { name: 'bbb_hunter',    fn: (db) => scrapeBBB() },
];

// Scrapers that can safely run in parallel (no shared rate limits)
const PARALLEL_GROUP_1 = ['github', 'nomorobolist'];
const PARALLEL_GROUP_2 = ['spamcalls', 'tellows', 'forums', 'shouldianswer', 'international', 'social_hunter', 'gist_hunter', 'bbb_hunter'];
const PARALLEL_GROUP_3 = ['validators'];

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
        const msg = `↻ ${name} retry #${attempt}`;
        console.log(`[orchestrator]   ${msg}`);
        logToFile(msg);
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
      const msg = `▶ Starting ${name}...`;
      console.log(`[orchestrator] ${msg}`);
      logToFile(msg);
      const records = await runScraperWithRetry(name, () => fn(db));
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

    try {
      const dbResult = upsertManyFromScraper(db, records);
      newFromSource = dbResult.newCount;
      updatedFromSource = dbResult.updatedCount;
      totalNew += newFromSource;
      totalUpdated += updatedFromSource;
    } catch (dbErr) {
      errors.push({ source: name, message: dbErr.message });
      continue;
    }

    // Track scraper health
    updateScraperHealth(db, name, records.length);

    // Warn if scraper returned 0 records
    if (records.length === 0) {
      const msg = `⚠ ${name}: 0 records (blocked?)`;
      console.warn(`[orchestrator] ${msg}\n`);
      logToFile(msg);
    } else {
      const msg = `✓ ${name}: ${records.length} records (${newFromSource} new, ${updatedFromSource} updated)`;
      console.log(`[orchestrator] ${msg}\n`);
      logToFile(msg);
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

  // Reset log file for new run
  fs.writeFileSync(LOG_FILE, `Starting scrape run #${runId} — ${new Date().toISOString()}\n`);

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
        const records = await runScraperWithRetry(name, () => fn(db));
        
        let newFromSource = 0;
        let updatedFromSource = 0;

        try {
          const dbResult = upsertManyFromScraper(db, records);
          newFromSource = dbResult.newCount;
          updatedFromSource = dbResult.updatedCount;
          totalNew += newFromSource;
          totalUpdated += updatedFromSource;
        } catch (dbErr) {
          throw dbErr;
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

/**
 * Run the autonomous web hunter to discover new spammers.
 */
async function runHunt(db) {
  const records = await hunt(db);
  if (records.length === 0) {
    return { discovered: 0 };
  }
  const { newCount, updatedCount } = upsertManyFromScraper(db, records);
  updateScraperHealth(db, 'web_hunter', records.length);
  return { discovered: records.length, newCount, updatedCount };
}

/**
 * Perform a deep archive crawl (Historical recovery)
 */
async function runDeepCrawl(db) {
  console.log('[orchestrator] 🚀 Launching DEEP ARCHIVE CRAWL...');
  const records = await runHistoricalCrawl();
  if (records.length === 0) return { discovered: 0 };
  const { newCount, updatedCount } = upsertManyFromScraper(db, records);
  updateScraperHealth(db, 'deep_crawl', records.length);
  return { discovered: records.length, newCount, updatedCount };
}

module.exports = { runAll, runHunt, runDeepCrawl };
