'use strict';

const cron = require('node-cron');
const { runAll } = require('./orchestrator');

/**
 * Start the spam number update scheduler.
 * Also runs a full scrape immediately on startup.
 *
 * @param {Database} db
 * @param {String} frequency - 'daily' or 'weekly'
 */
async function startScheduler(db, frequency = 'weekly') {
  const CRON_EXPRESSION = frequency === 'daily' ? '0 2 * * *' : frequency === 'continuous' ? '0 */4 * * *' : '0 2 * * 0';
  
  console.log(`[scheduler] Starting spam-numbers ${frequency} scheduler`);
  console.log(`[scheduler] Schedule: ${CRON_EXPRESSION} (every ${frequency === 'daily' ? 'day' : frequency === 'continuous' ? '4 hours' : 'Sunday'})`);

  // Run immediately on first start
  console.log('[scheduler] Running initial scrape now...\n');
  try {
    await runAll(db);
  } catch (err) {
    console.error(`[scheduler] Initial scrape failed: ${err.message}`);
  }

  // Schedule background runs
  const job = cron.schedule(CRON_EXPRESSION, async () => {
    console.log(`\n[scheduler] ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} scrape triggered — ${new Date().toISOString()}`);
    try {
      await runAll(db);
    } catch (err) {
      console.error(`[scheduler] ${frequency} scrape failed: ${err.message}`);
    }
  });

  // Log next scheduled run
  const nextRun = frequency === 'daily' ? getNextDay2AM() : getNextSunday2AM();
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
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  next.setDate(now.getDate() + daysUntilSunday);
  next.setHours(2, 0, 0, 0);
  return next;
}

function getNextDay2AM() {
  const now = new Date();
  const next = new Date(now);
  if (now.getHours() >= 2) next.setDate(now.getDate() + 1);
  next.setHours(2, 0, 0, 0);
  return next;
}

module.exports = { startScheduler };
