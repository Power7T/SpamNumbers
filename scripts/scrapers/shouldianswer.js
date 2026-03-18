'use strict';

/**
 * Should I Answer scraper
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE = 'shouldianswer';
const TARGET_URL = 'https://www.shouldianswer.com';

async function scrapeShouldIAnswer() {
  console.log('[shouldianswer] Checking latest community reviews...');
  const records = [];
  const seen = new Set();

  try {
    const { $, text } = await fetchWithStealth(TARGET_URL);
    
    // Target links like /phone-number/XXXX
    $('a[href*="/phone-number/"]').each((_, el) => {
      const raw = $(el).text().trim();
      const phone = normalizePhone(raw);
      if (phone && !seen.has(phone)) {
        seen.add(phone);
        // Find rating if nearby
        const parent = $(el).parent();
        const ratingText = parent.text().toLowerCase();
        let score = 5;
        if (ratingText.includes('negative') || ratingText.includes('neutral')) score = 7;
        if (ratingText.includes('scam') || ratingText.includes('telemarketer')) score = 8;

        records.push({
          phone_number: phone,
          source: SOURCE,
          spam_score: score,
          call_type: score > 7 ? 'scam' : 'telemarketer',
          country: 'Global',
          report_count: 5,
          user_notes: 'Reported on Should I Answer community feed',
          date_first_seen: new Date().toISOString(),
          raw_data: JSON.stringify({ homepage: true }),
        });
      }
    });

  } catch (err) {
    console.warn(`[shouldianswer] Failed: ${err.message}`);
  }

  console.log(`[shouldianswer] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeShouldIAnswer };
