'use strict';

const cron = require('node-cron');
const { runAll } = require('./orchestrator');

// Every Sunday at 02:00 AM
const CRON_EXPRESSION = '0 2 * * 0';

/**
 * Start the weekly spam number update scheduler.
 * Also runs a full scrape immediately on startup.
 *
 * @param {Database} db
 */
async function startScheduler(db) {
  console.log('[scheduler] Starting spam-numbers weekly scheduler');
  console.log(`[scheduler] Schedule: ${CRON_EXPRESSION} (every Sunday at 02:00 AM)`);

  // Run immediately on first start
  console.log('[scheduler] Running initial scrape now...\n');
  try {
    await runAll(db);
  } catch (err) {
    console.error(`[scheduler] Initial scrape failed: ${err.message}`);
  }

  // Schedule weekly runs
  const job = cron.schedule(CRON_EXPRESSION, async () => {
    console.log(`\n[scheduler] Weekly scrape triggered — ${new Date().toISOString()}`);
    try {
      await runAll(db);
    } catch (err) {
      console.error(`[scheduler] Weekly scrape failed: ${err.message}`);
    }
  });

  // Log next scheduled run
  const nextRun = getNextSunday2AM();
  console.log(`[scheduler] Next scheduled run: ${nextRun.toISOString()}`);
  console.log('[scheduler] Process running. Press Ctrl+C to stop.\n');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[scheduler] Shutting down...');
    job.stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    job.stop();
    process.exit(0);
  });
}

function getNextSunday2AM() {
  const now = new Date();
  const next = new Date(now);
  // Find next Sunday
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  next.setDate(now.getDate() + daysUntilSunday);
  next.setHours(2, 0, 0, 0);
  return next;
}

module.exports = { startScheduler };
