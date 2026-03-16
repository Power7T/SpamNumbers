'use strict';

const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');
const { getAllNumbers } = require('./db/queries');

const EXPORTS_DIR = path.join(__dirname, 'exports');

const CSV_COLUMNS = [
  { key: 'phone_number',      header: 'phone_number' },
  { key: 'spam_score',        header: 'spam_score' },
  { key: 'call_type',         header: 'call_type' },
  { key: 'country',           header: 'country' },
  { key: 'report_count',      header: 'report_count' },
  { key: 'sources',           header: 'sources' },
  { key: 'user_notes',        header: 'user_notes' },
  { key: 'date_first_seen',   header: 'date_first_seen' },
  { key: 'date_last_updated', header: 'date_last_updated' },
];

/**
 * Export the full spam_numbers database to a CSV file.
 *
 * @param {Database} db
 * @param {string|null} customPath - Optional output path. Defaults to exports/spam_numbers_TIMESTAMP.csv
 * @returns {string} The path of the created file
 */
function exportToCsv(db, customPath = null) {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);

  const outputPath = customPath || path.join(EXPORTS_DIR, `spam_numbers_${timestamp}.csv`);

  const rows = getAllNumbers(db);

  const csvData = rows.map(row => {
    const out = {};
    for (const { key } of CSV_COLUMNS) {
      let val = row[key];
      if (val == null) val = '';
      // Round spam_score to 2 decimal places
      if (key === 'spam_score' && typeof val === 'number') {
        val = Math.round(val * 100) / 100;
      }
      out[key] = val;
    }
    return out;
  });

  const output = stringify(csvData, {
    header: true,
    columns: CSV_COLUMNS.map(c => ({ key: c.key, header: c.header })),
    quoted_string: true,
  });

  fs.writeFileSync(outputPath, output, 'utf8');

  const fileSizeKb = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`[export] Wrote ${rows.length} records to ${outputPath} (${fileSizeKb} KB)`);

  return outputPath;
}

module.exports = { exportToCsv };
