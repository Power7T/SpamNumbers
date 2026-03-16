'use strict';

/**
 * SpamCalls.net scraper
 * This site is protected by Cloudflare. The scraper attempts a fetch and
 * gracefully returns an empty array if blocked — this is an expected,
 * non-error condition.
 */

const { checkForBlock, fetchHtml, sleep, DELAY_MS } = require('./base');
const { normalizePhone, scoreFromCount } = require('../normalizer');

const BASE_URL = 'https://www.spamcalls.net';
const SOURCE = 'spamcalls';
const MAX_NUMBERS = 20;

async function scrapeSpamCalls() {
  const blockCheck = await checkForBlock(`${BASE_URL}/en/`);

  if (blockCheck.blocked) {
    console.warn(`[spamcalls] Blocked by Cloudflare (HTTP ${blockCheck.status}), skipping this run`);
    return [];
  }

  // If we get through, try to scrape the recent/top numbers list
  const records = [];

  try {
    const listingUrls = [
      `${BASE_URL}/en/`,
      `${BASE_URL}/en/phone-numbers`,
    ];

    let $ = null;
    for (const url of listingUrls) {
      try {
        const result = await fetchHtml(url);
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
      const href = $( el).attr('href') || '';
      // Look for links that contain what appears to be a phone number segment
      if (/\d{7,}/.test(href)) links.push(href);
    });

    const uniqueLinks = [...new Set(links)].slice(0, MAX_NUMBERS);

    for (const href of uniqueLinks) {
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const phoneMatch = href.match(/([\d\-+()]{7,20})(?:\/|$)/);
      if (!phoneMatch) continue;
      const phone = normalizePhone(phoneMatch[1]);
      if (!phone) continue;

      try {
        const { $ } = await fetchHtml(fullUrl);
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
