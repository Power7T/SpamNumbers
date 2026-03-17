'use strict';

// Source reliability weights (government > crowdsourced > community lists)
const SOURCE_WEIGHTS = {
  ftc:           1.0,   // US government data — highest trust
  '800notes':    0.7,   // Large crowdsourced community
  shouldianswer: 0.7,
  youmail:       0.6,
  skipcalls:     0.6,
  whocallsme:    0.6,
  callercenter:  0.6,   // Community reverse lookup
  spamcalls:     0.5,
  nomorobolist:  0.5,   // Nomorobo public robocall list
  github:        0.4,   // Community-maintained, less verified
};

/**
 * Compute weighted score from per-source scores.
 * Weighted average: sum(score * weight) / sum(weights)
 */
function computeWeightedScore(sources) {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const { source, spam_score } of sources) {
    const w = SOURCE_WEIGHTS[source] || 0.5;
    weightedSum += spam_score * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? Math.min(10, weightedSum / totalWeight) : 0;
}

/**
 * Compute confidence level based on number of sources and total reports.
 */
function computeConfidence(sourceCount, reportCount) {
  if (sourceCount >= 3 || reportCount >= 50) return 'high';
  if (sourceCount >= 2 || reportCount >= 10) return 'medium';
  return 'low';
}

/**
 * Upsert a single scraped record into the database.
 * Two-step transaction:
 *   1. Upsert the per-source row in spam_sources
 *   2. Recompute the aggregate and upsert into spam_numbers
 *
 * Returns { isNew: boolean }
 */
function upsertFromScraper(db, record) {
  const {
    phone_number,
    source,
    spam_score = 0,
    call_type = 'other',
    country = 'US',
    report_count = 0,
    user_notes = '',
    date_first_seen,
    raw_data = '',
  } = record;

  const now = new Date().toISOString();
  const firstSeen = date_first_seen || now;

  const existsBefore = db
    .prepare('SELECT 1 FROM spam_numbers WHERE phone_number = ?')
    .get(phone_number);

  const txn = db.transaction(() => {
    // Step 1: Ensure spam_numbers row exists (needed before spam_sources due to FK)
    db.prepare(`
      INSERT OR IGNORE INTO spam_numbers
        (phone_number, spam_score, weighted_score, confidence, source_count, call_type, country, report_count, user_notes, date_first_seen, date_last_updated)
      VALUES
        (@phone_number, @spam_score, @spam_score, 'low', 1, @call_type, @country, @report_count, @user_notes, @date_first_seen, @date_last_updated)
    `).run({
      phone_number,
      spam_score,
      call_type,
      country,
      report_count,
      user_notes,
      date_first_seen: firstSeen,
      date_last_updated: now,
    });

    // Step 2: upsert the per-source attribution record
    db.prepare(`
      INSERT INTO spam_sources
        (phone_number, source, spam_score, report_count, user_notes, call_type, raw_data, scraped_at)
      VALUES
        (@phone_number, @source, @spam_score, @report_count, @user_notes, @call_type, @raw_data, @scraped_at)
      ON CONFLICT(phone_number, source) DO UPDATE SET
        spam_score   = MAX(spam_sources.spam_score, excluded.spam_score),
        report_count = spam_sources.report_count + excluded.report_count,
        user_notes   = CASE
                         WHEN excluded.user_notes = '' THEN spam_sources.user_notes
                         WHEN spam_sources.user_notes LIKE '%' || excluded.user_notes || '%' THEN spam_sources.user_notes
                         WHEN spam_sources.user_notes = '' THEN excluded.user_notes
                         ELSE spam_sources.user_notes || ' | ' || excluded.user_notes
                       END,
        call_type    = CASE
                         WHEN spam_sources.call_type = 'other' THEN excluded.call_type
                         ELSE spam_sources.call_type
                       END,
        scraped_at   = excluded.scraped_at
    `).run({
      phone_number,
      source,
      spam_score,
      report_count,
      user_notes,
      call_type,
      raw_data,
      scraped_at: now,
    });

    // Step 3: recompute aggregate from all sources for this number
    const sourcesForNumber = db.prepare(`
      SELECT source, spam_score, report_count, call_type, user_notes
      FROM spam_sources WHERE phone_number = ?
    `).all(phone_number);

    const aggScore = Math.max(...sourcesForNumber.map(s => s.spam_score));
    const aggCount = sourcesForNumber.reduce((sum, s) => sum + s.report_count, 0);
    const sourceCount = sourcesForNumber.length;
    const weightedScore = computeWeightedScore(sourcesForNumber);
    const confidence = computeConfidence(sourceCount, aggCount);

    // Prefer the most specific call_type
    const callTypes = sourcesForNumber.map(s => s.call_type).filter(Boolean);
    const bestCallType = callTypes.find(t => t !== 'other') || 'other';

    // Clean up concatenated notes
    const allNotes = sourcesForNumber.map(s => s.user_notes).filter(Boolean);
    const cleanNotes = Array.from(
      new Set(allNotes.flatMap(n => n.split(' | ').map(s => s.trim())).filter(Boolean))
    ).join(' | ');

    db.prepare(`
      UPDATE spam_numbers SET
        spam_score        = @spam_score,
        weighted_score    = @weighted_score,
        confidence        = @confidence,
        source_count      = @source_count,
        call_type         = CASE WHEN spam_numbers.call_type = 'other' THEN @call_type ELSE spam_numbers.call_type END,
        report_count      = @report_count,
        user_notes        = @user_notes,
        date_first_seen   = MIN(spam_numbers.date_first_seen, @date_first_seen),
        date_last_updated = @date_last_updated
      WHERE phone_number = @phone_number
    `).run({
      phone_number,
      spam_score: aggScore,
      weighted_score: Math.round(weightedScore * 10) / 10,
      confidence,
      source_count: sourceCount,
      call_type: bestCallType,
      report_count: aggCount,
      user_notes: cleanNotes,
      date_first_seen: firstSeen,
      date_last_updated: now,
    });
  });

  txn();
  return { isNew: !existsBefore };
}

/**
 * Look up a single phone number. Returns the row or null.
 * Skips whitelisted numbers.
 */
function lookupNumber(db, phoneNumber) {
  const row = db.prepare(`
    SELECT n.*, GROUP_CONCAT(DISTINCT s.source) AS sources
    FROM spam_numbers n
    LEFT JOIN spam_sources s ON s.phone_number = n.phone_number
    WHERE n.phone_number = ? AND n.is_whitelisted = 0
    GROUP BY n.phone_number
  `).get(phoneNumber);
  return row || null;
}

/**
 * Bulk lookup: check multiple phone numbers at once.
 * Returns an array of { phone_number, found, row } objects.
 */
function bulkLookup(db, phoneNumbers) {
  const stmt = db.prepare(`
    SELECT n.*, GROUP_CONCAT(DISTINCT s.source) AS sources
    FROM spam_numbers n
    LEFT JOIN spam_sources s ON s.phone_number = n.phone_number
    WHERE n.phone_number = ? AND n.is_whitelisted = 0
    GROUP BY n.phone_number
  `);

  return phoneNumbers.map(phone => {
    const row = stmt.get(phone);
    return { phone_number: phone, found: !!row, row };
  });
}

/**
 * Mark a phone number as whitelisted (false positive).
 */
function whitelistNumber(db, phoneNumber) {
  const result = db.prepare(
    'UPDATE spam_numbers SET is_whitelisted = 1 WHERE phone_number = ?'
  ).run(phoneNumber);
  return result.changes > 0;
}

/**
 * Remove whitelist flag from a phone number.
 */
function unwhitelistNumber(db, phoneNumber) {
  const result = db.prepare(
    'UPDATE spam_numbers SET is_whitelisted = 0 WHERE phone_number = ?'
  ).run(phoneNumber);
  return result.changes > 0;
}

/**
 * Decay scores for numbers not updated in the given number of days.
 * Reduces spam_score by decayFactor for stale entries.
 * Deletes entries with score below threshold after decay.
 */
function decayStaleData(db, staleDays = 180, decayFactor = 0.5, deleteThreshold = 1.0) {
  const cutoff = new Date(Date.now() - staleDays * 86400000).toISOString();

  const decayed = db.prepare(`
    UPDATE spam_numbers
    SET spam_score = spam_score * @factor,
        weighted_score = weighted_score * @factor
    WHERE date_last_updated < @cutoff AND is_whitelisted = 0
  `).run({ factor: decayFactor, cutoff });

  const deleted = db.prepare(`
    DELETE FROM spam_numbers
    WHERE spam_score < @threshold AND date_last_updated < @cutoff AND is_whitelisted = 0
  `).run({ threshold: deleteThreshold, cutoff });

  // Clean orphaned spam_sources
  db.prepare(`
    DELETE FROM spam_sources
    WHERE phone_number NOT IN (SELECT phone_number FROM spam_numbers)
  `).run();

  return { decayed: decayed.changes, deleted: deleted.changes };
}

/**
 * Return all spam_numbers rows joined with aggregated source list.
 */
function getAllNumbers(db) {
  return db.prepare(`
    SELECT n.*, GROUP_CONCAT(DISTINCT s.source) AS sources
    FROM spam_numbers n
    LEFT JOIN spam_sources s ON s.phone_number = n.phone_number
    WHERE n.is_whitelisted = 0
    GROUP BY n.phone_number
    ORDER BY n.weighted_score DESC, n.report_count DESC
  `).all();
}

/**
 * Database statistics for the stats command.
 */
function getStats(db) {
  const total = db.prepare('SELECT COUNT(*) AS count FROM spam_numbers WHERE is_whitelisted = 0').get().count;
  const whitelisted = db.prepare('SELECT COUNT(*) AS count FROM spam_numbers WHERE is_whitelisted = 1').get().count;
  const bySource = db.prepare(`
    SELECT source, COUNT(*) AS count
    FROM spam_sources
    GROUP BY source
    ORDER BY count DESC
  `).all();
  const byCountry = db.prepare(`
    SELECT country, COUNT(*) AS count
    FROM spam_numbers
    WHERE is_whitelisted = 0
    GROUP BY country
    ORDER BY count DESC
    LIMIT 15
  `).all();
  const byConfidence = db.prepare(`
    SELECT confidence, COUNT(*) AS count
    FROM spam_numbers
    WHERE is_whitelisted = 0
    GROUP BY confidence
  `).all();
  const top10 = db.prepare(`
    SELECT phone_number, weighted_score, spam_score, call_type, report_count, confidence, source_count, country
    FROM spam_numbers
    WHERE is_whitelisted = 0
    ORDER BY weighted_score DESC, report_count DESC
    LIMIT 10
  `).all();
  const lastRun = db.prepare(`
    SELECT * FROM scrape_runs
    ORDER BY id DESC LIMIT 1
  `).get();
  const health = db.prepare(`
    SELECT * FROM scraper_health ORDER BY source
  `).all();

  return { total, whitelisted, bySource, byCountry, byConfidence, top10, lastRun, health };
}

/**
 * Update scraper health tracking after a scrape.
 */
function updateScraperHealth(db, source, recordCount) {
  db.prepare(`
    INSERT INTO scraper_health (source, last_run_at, last_count, consecutive_zeros, total_runs)
    VALUES (@source, @now, @count, @zeros, 1)
    ON CONFLICT(source) DO UPDATE SET
      last_run_at = @now,
      last_count = @count,
      consecutive_zeros = CASE WHEN @count = 0 THEN scraper_health.consecutive_zeros + 1 ELSE 0 END,
      total_runs = scraper_health.total_runs + 1
  `).run({
    source,
    now: new Date().toISOString(),
    count: recordCount,
    zeros: recordCount === 0 ? 1 : 0,
  });
}

/**
 * Insert a new scrape_runs row and return its id.
 */
function insertRunLog(db) {
  const result = db.prepare(`
    INSERT INTO scrape_runs (started_at, status)
    VALUES (?, 'running')
  `).run(new Date().toISOString());
  return result.lastInsertRowid;
}

/**
 * Finalize a scrape run row.
 */
function finalizeRunLog(db, runId, { totalNew, totalUpdated, errors }) {
  db.prepare(`
    UPDATE scrape_runs
    SET finished_at   = ?,
        status        = 'completed',
        total_new     = ?,
        total_updated = ?,
        errors        = ?
    WHERE id = ?
  `).run(
    new Date().toISOString(),
    totalNew,
    totalUpdated,
    JSON.stringify(errors),
    runId
  );
}

module.exports = {
  upsertFromScraper,
  lookupNumber,
  bulkLookup,
  whitelistNumber,
  unwhitelistNumber,
  decayStaleData,
  getAllNumbers,
  getStats,
  updateScraperHealth,
  insertRunLog,
  finalizeRunLog,
  SOURCE_WEIGHTS,
};
