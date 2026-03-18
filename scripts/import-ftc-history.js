'use strict';

/**
 * Historical FTC DNC Import Utility
 * Uses browser-side fetch to bypass block on direct CSV navigation.
 */

const { getDb, closeDb } = require('./db/connection');
const { initSchema } = require('./db/schema');
const { upsertFromScraper } = require('./db/queries');
const { getBrowser, closeStealthBrowser } = require('./lib/stealth-browser');
const { normalizePhone, normalizeCallType } = require('./normalizer');

async function run() {
  const db = getDb();
  initSchema(db);

  const urls = [
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-17.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-16.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-13.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-12.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-11.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-10.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-09.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-06.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-05.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-04.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-03.csv",
    "https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_2026-03-02.csv"
  ];

  console.log(`\n[history] Importing ${urls.length} FTC CSV archives...`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  // Go to the main page first to get cookies/session
  await page.goto('https://www.ftc.gov/policy-notices/open-government/data-sets/do-not-call-data', { waitUntil: 'networkidle2' });

  let totalImported = 0;

  for (const url of urls) {
    const dateMatch = url.match(/\d{4}-\d{2}-\d{2}/);
    const date = dateMatch ? dateMatch[0] : 'unknown';
    
    try {
      console.log(`[history] Downloading ${date}...`);
      
      const csvText = await page.evaluate(async (csvUrl) => {
        try {
          const response = await fetch(csvUrl);
          if (!response.ok) return null;
          return await response.text();
        } catch (e) {
          return null;
        }
      }, url);

      if (!csvText || csvText.length < 500 || csvText.includes('<!DOCTYPE html>')) {
        console.warn(`[history] Skip ${date} (failed to fetch or invalid)`);
        continue;
      }

      const lines = csvText.split(/\r?\n/).slice(1);
      let count = 0;

      const txn = db.transaction(() => {
        for (const line of lines) {
          if (!line.trim()) continue;
          const parts = line.split(',');
          // Index 0 is Phone, 2 is Subject, 3 is CallType
          const rawPhone = parts[0] ? parts[0].replace(/"/g, '').trim() : '';
          const phone = normalizePhone(rawPhone);
          if (!phone) continue;

          const subject = parts[2] ? parts[2].replace(/"/g, '').trim() : '';
          const callType = parts[3] ? parts[3].replace(/"/g, '').trim() : '';
          
          upsertFromScraper(db, {
            phone_number: phone,
            source: 'ftc_csv',
            spam_score: 8,
            call_type: normalizeCallType(callType) || 'robocall',
            country: 'US',
            report_count: 1,
            user_notes: subject ? `Subject: ${subject}` : '',
            date_first_seen: date,
            raw_data: JSON.stringify({ historical: true, date }),
          });
          count++;
        }
      });
      
      txn();

      console.log(`[history] ✓ ${date}: ${count} numbers`);
      totalImported += count;
    } catch (err) {
      console.warn(`[history] ✗ ${date} failed: ${err.message}`);
    }
  }

  console.log(`\n[history] Done — Imported ${totalImported} historical records`);
  
  await page.close();
  closeDb();
  await closeStealthBrowser();
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { importFtcHistory: run };
