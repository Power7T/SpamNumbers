'use strict';

/**
 * Twitter/X OSINT Hunter (via Nitter)
 * Searches for real-time scam call reports on social media.
 * This is a 'Zero-API' approach to modern OSINT.
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone } = require('../normalizer');

const NITTER_SEARCH_URL = 'https://nitter.net/search?f=tweets&q=%23scamcall+%23robocall+OR+%22called+me%22+OR+%22who+called%22';

async function scrapeSocialOSINT() {
  console.log('[social_hunter] Searching for real-time social OSINT reports...');
  const records = [];
  const seen = new Set();

  try {
    const { $, text } = await fetchWithStealth(NITTER_SEARCH_URL);
    
    // Look for numbers in tweet text
    const phoneRegex = /([\d\-+()]{10,20})/g;
    const matches = text.match(phoneRegex) || [];
    const distinct = [...new Set(matches)];

    let addedFromSocial = 0;
    for (const rawNum of distinct) {
      const phone = normalizePhone(rawNum);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      records.push({
        phone_number: phone,
        source: 'social_osint',
        spam_score: 8, // Social reports are usually very fresh and verified by user
        call_type: 'scam',
        country: 'Global',
        report_count: 1,
        user_notes: 'Detected via real-time social OSINT stream',
        date_first_seen: new Date().toISOString(),
        raw_data: JSON.stringify({ nitter: true }),
      });
      addedFromSocial++;
    }
    
    console.log(`[social_hunter]     ✓ Discovered ${addedFromSocial} fresh numbers from social reports`);

  } catch (err) {
    console.warn(`[social_hunter]   ⚠ Social search fail: ${err.message}`);
  }

  console.log(`[social_hunter] Done — ${records.length} total records from social OSINT`);
  return records;
}

module.exports = { scrapeSocialOSINT };
