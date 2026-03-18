'use strict';

/**
 * International Focused Scraper (Australia, Singapore, Spain, etc.)
 * Targets region-specific DNC (Do Not Call) databases and community lists.
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone } = require('../normalizer');

const INTL_TARGETS = [
  { url: 'https://www.listaspam.com', country: 'ES', label: 'listaspam' },
  { url: 'https://www.donotcall.gov.sg', country: 'SG', label: 'dnc_sg' },
  { url: 'https://www.telemkt.com.au', country: 'AU', label: 'telemkt_au' },
  { url: 'https://www.tellows.pl', country: 'PL', label: 'tellows_pl' },
];

async function scrapeInternational() {
  console.log('[international] Starting global region sweep...');
  const records = [];
  const seen = new Set();

  for (const target of INTL_TARGETS) {
    try {
      console.log(`[international]   📍 Targeting ${target.country} via ${target.label}...`);
      const { $, text } = await fetchWithStealth(target.url);
      
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
          source: target.label,
          spam_score: 7, 
          call_type: 'telemarketer',
          country: target.country,
          report_count: 10,
          user_notes: `Detected on official ${target.country} DNC register or community board`,
          date_first_seen: new Date().toISOString(),
          raw_data: JSON.stringify({ country: target.country }),
        });
        addedFromSource++;
      }
      
      console.log(`[international]     ✓ Collected ${addedFromSource} numbers from ${target.country}`);
      await sleep(DELAY_MS * 2);

    } catch (err) {
      console.warn(`[international]   ⚠ Error on ${target.country}: ${err.message}`);
    }
  }

  console.log(`[international] Done — ${records.length} total records from international registers`);
  return records;
}

module.exports = { scrapeInternational };
