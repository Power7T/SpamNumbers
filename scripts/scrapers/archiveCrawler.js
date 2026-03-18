'use strict';

/**
 * Historical OSINT Archive Crawler (800notes, WhoCallsMe, etc.)
 * Crawls through the deep archives of community reporting boards
 * to recover thousands of historical spam numbers.
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone } = require('../normalizer');

const TARGETS = [
  { domain: '800notes.com', baseUrl: 'https://800notes.com/Numbers.aspx/', pages: 50, country: 'US' },
  { domain: 'whocallsme.com', baseUrl: 'https://whocallsme.com/Phone.aspx/', pages: 30, country: 'Global' },
  { domain: 'callercalls.com', baseUrl: 'https://callercalls.com/phone/', pages: 20, country: 'Global' }
];

async function runHistoricalCrawl() {
  console.log('[archive_crawler] Starting Deep Historical Extraction...');
  const records = [];
  const seen = new Set();

  for (const target of TARGETS) {
    console.log(`[archive_crawler]   📂 Deep-Crawling ${target.domain} (Target: ${target.pages} pages)...`);
    
    for (let i = 1; i <= target.pages; i++) {
      const pageUrl = `${target.baseUrl}${i}`;
      try {
        console.log(`[archive_crawler]     📄 Page ${i}...`);
        const { $, text } = await fetchWithStealth(pageUrl);
        
        // Extract numbers from the current archive page
        const phoneRegex = /([\d\-+()]{10,20})/g;
        const matches = text.match(phoneRegex) || [];
        const distinct = [...new Set(matches)];

        let addedFromPage = 0;
        for (const rawNum of distinct) {
          const phone = normalizePhone(rawNum);
          if (!phone || seen.has(phone)) continue;
          seen.add(phone);

          records.push({
            phone_number: phone,
            source: `archive_${target.domain.split('.')[0]}`,
            spam_score: 5, // Historical data has lower weight than live reports
            call_type: 'other',
            country: target.country,
            report_count: 5,
            user_notes: 'Historical record recovered from OSINT archive',
            date_first_seen: new Date().toISOString(),
            raw_data: JSON.stringify({ page: i }),
          });
          addedFromPage++;
        }
        
        console.log(`[archive_crawler]       ✓ Extracted ${addedFromPage} candidates from page ${i}`);
        
        // Avoid aggressive rate limiting during deep crawls
        await sleep(DELAY_MS * 3);

      } catch (err) {
        console.warn(`[archive_crawler]     ⚠ Failed on page ${i}: ${err.message}`);
        await sleep(5000); // Wait longer on error
      }
    }
  }

  console.log(`[archive_crawler] Done — Recovered ${records.length} historical records.`);
  return records;
}

module.exports = { runHistoricalCrawl };
