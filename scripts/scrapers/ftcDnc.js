'use strict';

const { fetchWithStealth, fetchRawWithStealth } = require('../lib/stealth-browser');
const { normalizePhone, normalizeCallType } = require('../normalizer');
const { getMissingFtcDates } = require('../db/queries');

const SOURCE = 'ftc_csv';

async function scrapeFtcCsv(db) {
  const records = [];
  
  console.log(`[ftc_csv] Fetching the FTC directory page to find all available CSV files...`);
  
  // Scrape the main index page to dynamically find ALL currently hosted files
  let allCsvUrls = [];
  try {
    const { $ } = await fetchWithStealth('https://www.ftc.gov/policy-notices/open-government/data-sets/do-not-call-data');
    if ($) {
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('DNC_Complaint_Numbers') && href.endsWith('.csv')) {
          let fullUrl = href;
          if (!fullUrl.startsWith('http')) {
               fullUrl = 'https://www.ftc.gov' + (fullUrl.startsWith('/') ? '' : '/') + fullUrl;
          }
          if (!allCsvUrls.includes(fullUrl)) allCsvUrls.push(fullUrl);
        }
      });
    }
  } catch (err) {
    console.warn(`[ftc_csv] Failed to parse directory: ${err.message}`);
    return records;
  }
  
  if (allCsvUrls.length === 0) {
    console.log(`[ftc_csv] No CSV links found on the main directory page.`);
    return records;
  }
  
  console.log(`[ftc_csv] Found ${allCsvUrls.length} total CSV files hosted on the FTC site!`);

  // Now filter the URLs against the database to download ONLY the ones we are missing
  const missingUrls = [];
  for (const url of allCsvUrls) {
    const dateMatch = url.match(/\d{4}-\d{2}-\d{2}/);
    if (!dateMatch) continue;
    const date = dateMatch[0];
    
    // Check if we already have records for this specific CSV date
    const count = db.prepare("SELECT COUNT(*) AS count FROM spam_sources WHERE source = 'ftc_csv' AND raw_data LIKE ?").get(`%${date}%`).count;
    if (count === 0) {
      missingUrls.push({ url, date });
    }
  }
  
  if (missingUrls.length === 0) {
    console.log(`[ftc_csv] Your database already has all ${allCsvUrls.length} available files! Up to date!`);
    return records;
  }
  
  console.log(`[ftc_csv] Downloading ${missingUrls.length} new CSV files...`);

  // Download all missing files sequentially
  for (const { url, date } of missingUrls) {

      
    try {
      console.log(`[ftc_csv] Trying ${url}...`);
      const { text } = await fetchRawWithStealth(url);
      
      if (!text || text.length < 500 || text.includes('<!DOCTYPE html>')) {
        console.warn(`[ftc_csv] Skipping ${date} (Invalid CSV data)`);
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
    } catch (err) {
      console.warn(`[ftc_csv] Failed to fetch ${date}: ${err.message}`);
    }
  }

  console.log(`[ftc_csv] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeFtcCsv };
