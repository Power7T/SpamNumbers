'use strict';

/**
 * YouMail Robocall Index Scraper
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE = 'youmail';
const TARGET_URL = 'https://www.youmail.com/directory/robocall-index';

async function scrapeYouMail() {
  console.log('[youmail] Checking top community robocalls...');
  const records = [];
  const seen = new Set();

  try {
    const { $ } = await fetchWithStealth(TARGET_URL);
    
    // Look for numbers in the tables/links
    $('a[href*="/directory/phone/"]').each((_, el) => {
      const raw = $(el).text().trim();
      const phone = normalizePhone(raw);
      if (phone && !seen.has(phone)) {
        seen.add(phone);
        records.push({
          phone_number: phone,
          source: SOURCE,
          spam_score: 7,
          call_type: 'robocall',
          country: 'US',
          report_count: 50, // Default for top robocall list
          user_notes: 'Highly active robocall reported on YouMail Index',
          date_first_seen: new Date().toISOString(),
          raw_data: JSON.stringify({ index: true }),
        });
      }
    });

  } catch (err) {
    console.warn(`[youmail] Failed: ${err.message}`);
  }

  console.log(`[youmail] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeYouMail };
