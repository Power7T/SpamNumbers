'use strict';

/**
 * Should I Answer scraper
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE = 'shouldianswer';
const TARGET_DOMAINS = [
  'https://www.shouldianswer.com',
  'https://www.shouldianswer.net',
  'https://www.chistiamofregando.it',
  'https://www.quienmehaallamado.es',
  'https://www.werhatangerufen.com',
  'https://www.quimappelle.fr',
  'https://www.inkietujacego.pl'
];

async function scrapeShouldIAnswer() {
  console.log('[shouldianswer] Initializing multi-country review sweep...');
  const records = [];
  const seen = new Set();

  for (const baseUrl of TARGET_DOMAINS) {
    try {
      console.log(`[shouldianswer]   📍 Scraping ${baseUrl.split('.').slice(-2).join('.')}...`);
      const { $, text } = await fetchWithStealth(baseUrl);
      
      // Target links like /phone-number/XXXX or other regional formats
      $('a[href*="/phone-number/"], a[href*="/numero-di-telefono/"], a[href*="/numero/"]').each((_, el) => {
        const raw = $(el).text().trim();
        const phone = normalizePhone(raw);
        if (phone && !seen.has(phone)) {
          seen.add(phone);
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
            user_notes: `Found in community review: ${baseUrl.replace('https://www.', '')}`,
            date_first_seen: new Date().toISOString(),
            raw_data: JSON.stringify({ domain: baseUrl }),
          });
        }
      });

      await sleep(DELAY_MS * 2);
    } catch (err) {
      console.warn(`[shouldianswer]   ⚠ Regional fail (${baseUrl}): ${err.message}`);
    }
  }

  console.log(`[shouldianswer] Done — ${records.length} total records`);
  return records;
}

module.exports = { scrapeShouldIAnswer };
