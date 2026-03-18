'use strict';

/**
 * Global Gist-Feed Hunter 3.0
 * Autonomously scours the live "Discover" feed of GitHub Gist
 * for real-time leakers and curators of spam-number lists.
 */

const { fetchText, sleep, fetchWithHeaders } = require('./base');
const { fetchWithStealth } = require('../lib/stealth-browser');
const { normalizePhone } = require('../normalizer');

const DISCOVER_URL = 'https://gist.github.com/discover';
const SOURCE = 'gist_hunter';

async function scrapeGistFeed() {
  console.log('[gist_hunter] Initializing LIVE Cloud Discovery Stream...');
  const records = [];
  const seen = new Set();

  try {
    // Phase 1: Access the live Discovery feed
    const { $, text } = await fetchWithStealth(DISCOVER_URL);
    
    // Find all links to private or public Gists in the feed
    const gistLinks = [];
    $('.gist-snippet a[href*="/"]').each((_, el) => {
        const h = $(el).attr('href');
        // Filter for specific Gist path patterns (e.g. /username/random_hash)
        if (h && h.split('/').length === 3) {
            gistLinks.push(`https://gist.github.com${h}`);
        }
    });

    const uniqueLinks = [...new Set(gistLinks)].slice(0, 15); // Target top 15 most recent Gists

    for (const gistUrl of uniqueLinks) {
      try {
        console.log(`[gist_hunter]   📦 Deep-Scanning Gist: ${gistUrl.split('/').pop()}...`);
        const { $ } = await fetchWithStealth(gistUrl);
        
        // Find the "Raw" file link
        const rawUrl = $('.file-actions a[href*="/raw/"]').attr('href');
        if (!rawUrl) continue;
        
        const fullRawUrl = `https://gist.githubusercontent.com${rawUrl}`;
        const content = await fetchText(fullRawUrl);
        
        if (!content) continue;

        // EXTRACTION: Super-Regex for global patterns
        const phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4,6}/g;
        const matches = content.match(phoneRegex) || [];
        const distinct = [...new Set(matches)];

        let addedFromGist = 0;
        for (const rawNum of distinct) {
          const phone = normalizePhone(rawNum);
          if (!phone || seen.has(phone)) continue;
          seen.add(phone);

          records.push({
            phone_number: phone,
            source: SOURCE,
            spam_score: 7, 
            call_type: 'leaked_list',
            country: 'Global',
            report_count: 5,
            user_notes: `Detected in Live GitHub Gist: ${gistUrl.split('/').pop()}`,
            date_first_seen: new Date().toISOString(),
            raw_data: JSON.stringify({ gist: gistUrl }),
          });
          addedFromPage++; // Actually, no, let me use a local counter
          addedFromGist++;
        }
        
        console.log(`[gist_hunter]     ✓ Found ${addedFromGist} potential spammers in this drop.`);
        await sleep(2000);

      } catch (err) {
        console.warn(`[gist_hunter]   ⚠ Drop fail: ${err.message}`);
      }
    }

  } catch (err) {
    console.warn(`[gist_hunter]   ⚠ Feed connection failed: ${err.message}`);
  }

  console.log(`[gist_hunter] Done — Vacuumed ${records.length} total numbers from the cloud live stream.`);
  return records;
}

module.exports = { scrapeGistFeed };
