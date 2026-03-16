'use strict';

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
        (phone_number, spam_score, call_type, country, report_count, user_notes, date_first_seen, date_last_updated)
      VALUES
        (@phone_number, @spam_score, @call_type, @country, @report_count, @user_notes, @date_first_seen, @date_last_updated)
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

    // Step 2: recompute aggregate from all sources for this number
    const agg = db.prepare(`
      SELECT
        MAX(spam_score)                    AS agg_score,
        SUM(report_count)                  AS agg_count,
        GROUP_CONCAT(user_notes, ' | ')    AS agg_notes,
        GROUP_CONCAT(DISTINCT call_type)   AS agg_call_types
      FROM spam_sources
      WHERE phone_number = ?
    `).get(phone_number);

    // Prefer the most specific call_type (anything over 'other')
    const callTypes = (agg.agg_call_types || 'other').split(',').filter(Boolean);
    const bestCallType = callTypes.find(t => t !== 'other') || 'other';

    // Clean up concatenated notes: remove empty segments and duplicates
    const cleanNotes = Array.from(
      new Set(
        (agg.agg_notes || '')
          .split(' | ')
          .map(n => n.trim())
          .filter(Boolean)
      )
    ).join(' | ');

    db.prepare(`
      INSERT INTO spam_numbers
        (phone_number, spam_score, call_type, country, report_count, user_notes, date_first_seen, date_last_updated)
      VALUES
        (@phone_number, @spam_score, @call_type, @country, @report_count, @user_notes, @date_first_seen, @date_last_updated)
      ON CONFLICT(phone_number) DO UPDATE SET
        spam_score        = excluded.spam_score,
        call_type         = CASE
                              WHEN spam_numbers.call_type = 'other' THEN excluded.call_type
                              ELSE spam_numbers.call_type
                            END,
        report_count      = excluded.report_count,
        user_notes        = excluded.user_notes,
        date_first_seen   = MIN(spam_numbers.date_first_seen, excluded.date_first_seen),
        date_last_updated = excluded.date_last_updated
    `).run({
      phone_number,
      spam_score: agg.agg_score || 0,
      call_type: bestCallType,
      country,
      report_count: agg.agg_count || 0,
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
 */
function lookupNumber(db, phoneNumber) {
  const row = db.prepare(`
    SELECT n.*, GROUP_CONCAT(DISTINCT s.source) AS sources
    FROM spam_numbers n
    LEFT JOIN spam_sources s ON s.phone_number = n.phone_number
    WHERE n.phone_number = ?
    GROUP BY n.phone_number
  `).get(phoneNumber);
  return row || null;
}

/**
 * Return all spam_numbers rows joined with aggregated source list.
 */
function getAllNumbers(db) {
  return db.prepare(`
    SELECT n.*, GROUP_CONCAT(DISTINCT s.source) AS sources
    FROM spam_numbers n
    LEFT JOIN spam_sources s ON s.phone_number = n.phone_number
    GROUP BY n.phone_number
    ORDER BY n.spam_score DESC, n.report_count DESC
  `).all();
}

/**
 * Database statistics for the stats command.
 */
function getStats(db) {
  const total = db.prepare('SELECT COUNT(*) AS count FROM spam_numbers').get().count;
  const bySource = db.prepare(`
    SELECT source, COUNT(*) AS count
    FROM spam_sources
    GROUP BY source
    ORDER BY count DESC
  `).all();
  const top10 = db.prepare(`
    SELECT phone_number, spam_score, call_type, report_count
    FROM spam_numbers
    ORDER BY spam_score DESC, report_count DESC
    LIMIT 10
  `).all();
  const lastRun = db.prepare(`
    SELECT * FROM scrape_runs
    ORDER BY id DESC LIMIT 1
  `).get();

  return { total, bySource, top10, lastRun };
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
  getAllNumbers,
  getStats,
  insertRunLog,
  finalizeRunLog,
};
