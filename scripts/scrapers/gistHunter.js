'use strict';

/**
 * Global Gist-Feed Hunter 3.0
 * Autonomously scours the live "Discover" feed of GitHub Gist
 * for real-time leakers and curators of spam-number lists.
 */

const { fetchText, sleep, fetchWithHeaders } = require('./base');
const { fetchWithStealth } = require('../lib/stealth-browser');
const { normalizePhone } = require('../normalizer');

const SEARCH_URLS = [
  'https://gist.github.com/search?o=desc&q=spam+numbers&s=updated',
  'https://gist.github.com/search?o=desc&q=blocklist&s=updated',
  'https://gist.github.com/search?o=desc&q=fraud+call&s=updated',
  'https://gist.github.com/search?o=desc&q=scam+call&s=updated',
  'https://gist.github.com/search?o=desc&q=phishing+numbers&s=updated',
  'https://gist.github.com/search?o=desc&q=telemarketer&s=updated',
  'https://gist.github.com/search?o=desc&q=spammers+list&s=updated',
  'https://gist.github.com/search?o=desc&q=robocall+log&s=updated',
  'https://gist.github.com/search?o=desc&q=caller+blacklist&s=updated'
];

const SOURCE = 'gist_hunter';

async function scrapeGistFeed() {
  console.log('[gist_hunter] Initializing HIGH-PRECISION Cloud Search...');
  const records = [];
  const seen = new Set();

  for (const searchUrl of SEARCH_URLS) {
    try {
      console.log(`[gist_hunter]   🏹 Searching: ${searchUrl.split('q=')[1].split('&')[0]}...`);
      const { $, text } = await fetchWithStealth(searchUrl);
      
      // Find all Gist result links
      const gistLinks = [];
      $('.gist-snippet a[href*="/"]').each((_, el) => {
        const h = $(el).attr('href');
        if (h && h.split('/').length === 3) {
           gistLinks.push(`https://gist.github.com${h}`);
        }
      });

      const uniqueLinks = [...new Set(gistLinks)].slice(0, 5); // Target top 5 per keyword

      for (const gistUrl of uniqueLinks) {
        try {
          console.log(`[gist_hunter]     📦 Scouring Gist: ${gistUrl.split('/').pop()}...`);
          // Visit the Raw link if possible, or just the main page text
          const { text: pageText } = await fetchWithStealth(gistUrl);
          
          // EXTRACTION: Multi-pattern Regex
          const phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4,6}/g;
          const matches = pageText.match(phoneRegex) || [];
          
          let addedFromGist = 0;
          for (const rawNum of matches) {
            const phone = normalizePhone(rawNum);
            if (!phone || seen.has(phone)) continue;
            seen.add(phone);

            records.push({
              phone_number: phone,
              source: SOURCE,
              spam_score: 8, 
              call_type: 'verified_drop',
              country: 'Global',
              report_count: 5,
              user_notes: `Recovered via Targeted Gist-Search: ${gistUrl.split('/').pop()}`,
              date_first_seen: new Date().toISOString(),
              raw_data: JSON.stringify({ gist: gistUrl }),
            });
            addedFromGist++;
          }
          
          console.log(`[gist_hunter]       ✓ Captured ${addedFromGist} identities from this drop.`);
          await sleep(2000);

        } catch (err) { /* skip individual fail */ }
      }

    } catch (err) {
      console.warn(`[gist_hunter]   ⚠ Search Fail (${searchUrl}): ${err.message}`);
    }
  }

  console.log(`[gist_hunter] Done — Vacuumed ${records.length} high-precision cloud signatures.`);
  return records;
}

module.exports = { scrapeGistFeed };
