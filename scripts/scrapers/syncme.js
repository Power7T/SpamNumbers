'use strict';

/**
 * Sync.me (sync.me) scraper
 * Fetches top spammers by country.
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone, scoreFromCount } = require('../normalizer');

const SOURCE = 'syncme';
const COUNTRIES = ['us', 'uk', 'it', 'es', 'pt', 'ar', 'ru', 'br', 'mx', 'fr', 'de'];
const MAX_PER_COUNTRY = 20;

async function scrapeSyncMe() {
  const records = [];
  const seen = new Set();

  try {
    for (const countryCode of COUNTRIES) {
      const url = `https://sync.me/top-spammers/${countryCode}/`;
      console.log(`[syncme] Scraping ${countryCode.toUpperCase()}...`);
      
      try {
        const { $ } = await fetchWithStealth(url);
        
        let foundThisCountry = 0;
        // Sync.me lists spammers in a table or list
        $('a[href*="/phone/"]').each((_, el) => {
          if (foundThisCountry >= MAX_PER_COUNTRY) return;
          
          const href = $(el).attr('href') || '';
          const phoneRaw = href.split('/').pop().replace(/[^0-9+]/g, '');
          if (!phoneRaw || phoneRaw.length < 7) return;

          const phone = normalizePhone(phoneRaw);
          if (!phone || seen.has(phone)) return;
          seen.add(phone);

          const spammerName = $(el).find('.spammer-name').text().trim() || 'Spammer';
          const reportText = $(el).find('.spammer-reports').text().match(/(\d+)/);
          const reportCount = reportText ? parseInt(reportText[1], 10) : 1;

          records.push({
            phone_number: phone,
            source: SOURCE,
            spam_score: scoreFromCount(reportCount),
            call_type: 'other',
            country: countryCode.toUpperCase(),
            report_count: reportCount,
            user_notes: spammerName !== 'Spammer' ? `Identified as: ${spammerName}` : '',
            date_first_seen: new Date().toISOString(),
            raw_data: JSON.stringify({ country: countryCode }),
          });
          foundThisCountry++;
        });
      } catch (err) {
        console.warn(`[syncme] Failed country ${countryCode}: ${err.message}`);
      }
      
      await sleep(DELAY_MS * 2);
    }
  } catch (err) {
    console.warn(`[syncme] Global error: ${err.message}`);
  }

  console.log(`[syncme] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeSyncMe };
