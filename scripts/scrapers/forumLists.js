'use strict';

/**
 * Community Forum Scraper (800notes, WhoCallsMe, WhoCalled, etc.)
 * These sites are protected by Cloudflare and require stealth-browser scraping.
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE_MAP = {
  '800notes.com': { url: 'https://800notes.com', country: 'US', label: '800notes' },
  'whocalled.us': { url: 'http://whocalled.us/recent', country: 'US', label: 'whocalled.us' },
  'whocallsme.com': { url: 'https://whocallsme.com', country: 'Global', label: 'whocallsme' },
  'whocalledme.org': { url: 'https://whocalledme.org', country: 'Global', label: 'whocalledme.org' },
  'whocalled.today': { url: 'https://whocalled.today', country: 'Global', label: 'whocalled.today' },
  'callersdb.com': { url: 'https://callersdb.com', country: 'Global', label: 'callersdb' },
  'callercalls.com': { url: 'https://callercalls.com', country: 'Global', label: 'callercalls' },
  'whocalledme.com.au': { url: 'https://whocalledme.com.au', country: 'AU', label: 'whocalledme_au' }
};

async function scrapeForums() {
  console.log('[forums] Initializing community forum sweep (Cloudflare enabled)...');
  const records = [];
  const seen = new Set();

  for (const domain in SOURCE_MAP) {
    const config = SOURCE_MAP[domain];
    try {
      console.log(`[forums]   🌐 Scraping ${config.label}...`);
      const { $, text } = await fetchWithStealth(config.url);
      
      // Look for phone numbers in the text or inside links
      const phoneRegex = /([\d\-+()]{9,20})/g;
      const matches = text.match(phoneRegex) || [];
      const distinct = [...new Set(matches)];

      let addedFromSource = 0;
      for (const rawNum of distinct) {
        const phone = normalizePhone(rawNum);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);

        records.push({
          phone_number: phone,
          source: config.label,
          spam_score: 6, // Community reports from forums have medium score
          call_type: 'bulk',
          country: config.country,
          report_count: 1,
          user_notes: `Found in recent reports on ${domain}`,
          date_first_seen: new Date().toISOString(),
          raw_data: JSON.stringify({ domain }),
        });
        addedFromSource++;
      }
      
      console.log(`[forums]     ✓ Collected ${addedFromSource} numbers from ${config.label}`);
      await sleep(DELAY_MS * 2);

    } catch (err) {
      console.warn(`[forums]   ⚠ Could not scrape ${config.label}: ${err.message}`);
    }
  }

  console.log(`[forums] Done — ${records.length} total records from community forums`);
  return records;
}

module.exports = { scrapeForums };
