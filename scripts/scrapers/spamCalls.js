'use strict';

/**
 * SpamCalls.net scraper
 * This site is protected by Cloudflare.
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone, scoreFromCount } = require('../normalizer');

const BASE_URL = 'https://www.spamcalls.net';
const SOURCE = 'spamcalls';

async function scrapeSpamCalls() {
  const records = [];
  const seen = new Set();
  const MAX_NUMBERS = 50; // Increased limit for stealth mode

  try {
    const listingUrls = [
      `${BASE_URL}/en/`,
      `${BASE_URL}/en/phone-numbers`,
    ];

    let $ = null;
    for (const url of listingUrls) {
      try {
        const result = await fetchWithStealth(url);
        $ = result.$;
        break;
      } catch (_) { continue; }
    }

    if (!$) {
      console.warn('[spamcalls] Could not load any listing page, skipping');
      return [];
    }

    // Collect phone number links
    const links = [];
    $('a[href*="/en/"], a[href*="phone"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      // Look for links that contain what appears to be a phone number segment
      if (/\d{7,}/.test(href)) links.push(href);
    });

    const uniqueLinks = [...new Set(links)].slice(0, MAX_NUMBERS);

    for (const href of uniqueLinks) {
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const phoneMatch = href.match(/([\d\-+()]{7,20})(?:\/|$)/);
      if (!phoneMatch) continue;
      const phone = normalizePhone(phoneMatch[1]);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      try {
        const { $ } = await fetchWithStealth(fullUrl);
        const countText = $('[class*="count"], [class*="report"]').first().text();
        const countMatch = countText.match(/(\d+)/);
        const reportCount = countMatch ? parseInt(countMatch[1], 10) : 1;
        const notes = [];
        $('[class*="comment"], [class*="review"]').each((_, el) => {
          const t = $(el).text().trim().replace(/\s+/g, ' ').slice(0, 200);
          if (t.length > 10) notes.push(t);
        });

        records.push({
          phone_number: phone,
          source: SOURCE,
          spam_score: scoreFromCount(reportCount),
          call_type: 'other',
          country: 'US',
          report_count: reportCount,
          user_notes: notes.slice(0, 3).join(' | '),
          date_first_seen: new Date().toISOString(),
          raw_data: JSON.stringify({ url: fullUrl }),
        });
      } catch (_) { /* skip this number */ }

      await sleep(DELAY_MS);
    }
  } catch (err) {
    console.warn(`[spamcalls] Unexpected error: ${err.message}, returning partial results`);
  }

  console.log(`[spamcalls] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeSpamCalls };
