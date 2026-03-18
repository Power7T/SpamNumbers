'use strict';

/**
 * Historical FTC API Import Utility
 * Usage: node import-ftc-api.js [from-YYYY-MM-DD] [to-YYYY-MM-DD]
 */

const { getDb, closeDb } = require('./db/connection');
const { initSchema } = require('./db/schema');
const { upsertFromScraper } = require('./db/queries');
const { fetchText } = require('./scrapers/base');
const { normalizePhone, normalizeCallType } = require('./normalizer');

// Load .env keys manually
const fs = require('fs');
const path = require('path');
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [key, ...vals] = line.split('=');
    if (key && vals.length > 0) process.env[key.trim()] = vals.join('=');
  }
}
loadEnv();

async function run() {
  const apiKey = process.env.FTC_API_KEY;
  if (!apiKey) {
    console.error('Error: FTC_API_KEY not found. Run: node index.js config FTC_API_KEY <your_key>');
    process.exit(1);
  }

  const fromDate = process.argv[2] || '2026-03-01';
  const toDate = process.argv[3] || new Date().toISOString().slice(0, 10);

  console.log(`\n[api_history] Importing FTC data from ${fromDate} to ${toDate}...`);
  console.log('[api_history] Note: API limit is 50 items per page. For large datasets, CSV import is recommended.');

  const db = getDb();
  initSchema(db);

  let offset = 0;
  const itemsPerPage = 50;
  let totalImported = 0;

  try {
    while (true) {
      const url = `https://api.ftc.gov/v0/dnc-complaints?api_key=${apiKey}&created_date_from="${fromDate}"&created_date_to="${toDate}"&items_per_page=${itemsPerPage}&offset=${offset}`;
      
      console.log(`[api_history] Fetching offset ${offset}...`);
      const res = await fetchText(url, { timeout: 15000 });
      const json = JSON.parse(res);

      const data = json.data || [];
      if (data.length === 0) break;

      const txn = db.transaction(() => {
        for (const item of data) {
          const attr = item.attributes || {};
          const phone = normalizePhone(attr['company-phone-number']);
          if (!phone) continue;

          upsertFromScraper(db, {
            phone_number: phone,
            source: 'ftc_api',
            spam_score: 9,
            call_type: normalizeCallType(attr['subject']) || 'scam',
            country: 'US',
            report_count: 1,
            user_notes: `${attr['subject']} | Location: ${attr['consumer-city']}, ${attr['consumer-state']}`,
            date_first_seen: attr['created-date'],
            raw_data: JSON.stringify({ id: item.id }),
          });
          totalImported++;
        }
      });
      txn();

      console.log(`[api_history] Imported ${data.length} records... (Total: ${totalImported})`);
      
      offset += itemsPerPage;
      if (offset >= (json.meta ? json.meta['record-total'] : 0)) break;
      
      // Delay to respect rate limits if needed
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (err) {
    console.error(`[api_history] Fatal error: ${err.message}`);
  }

  console.log(`\n[api_history] Done — Imported ${totalImported} historical records from API`);
  closeDb();
}

run().catch(console.error);
