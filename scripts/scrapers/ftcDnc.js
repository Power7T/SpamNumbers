'use strict';

/**
 * FTC DNC Daily CSV Scraper
 * Downloads daily CSV complain reports from ftc.gov.
 * Direct URL pattern: https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_YYYY-MM-DD.csv
 */

const { fetchRawWithStealth } = require('../lib/stealth-browser');
const { normalizePhone, normalizeCallType } = require('../normalizer');

const SOURCE = 'ftc_csv';

/**
 * Returns a YYYY-MM-DD string for N days ago.
 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function scrapeFtcCsv() {
  const records = [];
  const datesToTry = [0, 1, 2, 3, 4, 5, 6, 7].map(daysAgo);

  console.log(`[ftc_csv] Checking for daily CSV files...`);

  for (const date of datesToTry) {
    const csvUrl = `https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_${date}.csv`;
    
    try {
      console.log(`[ftc_csv] Trying ${csvUrl}...`);
      const { text } = await fetchRawWithStealth(csvUrl);
      
      if (!text || text.length < 500 || text.includes('<!DOCTYPE html>')) {
        continue;
      }

      const lines = text.split(/\r?\n/).slice(1);
      let addedFromDate = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(',');
        const rawPhone = parts[0] ? parts[0].replace(/"/g, '').trim() : '';
        const phone = normalizePhone(rawPhone);
        if (!phone) continue;

        const subject = parts[2] ? parts[2].replace(/"/g, '').trim() : '';
        const callType = parts[3] ? parts[3].replace(/"/g, '').trim() : '';
        
        records.push({
          phone_number: phone,
          source: SOURCE,
          spam_score: 8,
          call_type: normalizeCallType(callType) || 'robocall',
          country: 'US',
          report_count: 1,
          user_notes: subject ? `Subject: ${subject}` : '',
          date_first_seen: date,
          raw_data: JSON.stringify({ date }),
        });
        addedFromDate++;
      }
      
      console.log(`[ftc_csv] Successfully imported ${addedFromDate} entries from ${date}`);
      // Only get the most recent valid one to keep the daily run bounded
      if (addedFromDate > 0) break; 
    } catch (err) {
      console.warn(`[ftc_csv] Failed to fetch ${date}: ${err.message}`);
    }
  }

  console.log(`[ftc_csv] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeFtcCsv };
