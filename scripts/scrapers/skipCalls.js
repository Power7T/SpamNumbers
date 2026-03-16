'use strict';

/**
 * SkipCalls.net scraper
 * SkipCalls maintains a database of 1M+ reported spam numbers.
 * No signup or API key required.
 */

const { checkForBlock, fetchHtml, sleep, DELAY_MS } = require('./base');
const { normalizePhone, normalizeCallType, scoreFromCount } = require('../normalizer');

const BASE_URL = 'https://skipcalls.com';
const SOURCE = 'skipcalls';
const MAX_PAGES = 5;
const MAX_NUMBERS = 40;

async function scrapeSkipCalls() {
  const blockCheck = await checkForBlock(`${BASE_URL}/numbers`);
  if (blockCheck.blocked) {
    console.warn(`[skipcalls] Blocked (HTTP ${blockCheck.status}), skipping`);
    return [];
  }

  const records = [];
  const seen = new Set();

  const listingPaths = [
    '/numbers',
    '/numbers/page/1',
    '/',
  ];

  let startUrl = null;
  for (const path of listingPaths) {
    try {
      const { $ } = await fetchHtml(`${BASE_URL}${path}`);
      // Check if the page has phone-like content
      const bodyText = $.root().text();
      if (/\d{3}[\-\.]\d{3}[\-\.]\d{4}/.test(bodyText)) {
        startUrl = `${BASE_URL}${path}`;
        break;
      }
    } catch (_) { continue; }
  }

  if (!startUrl) {
    console.warn('[skipcalls] Could not find a valid listing page, skipping');
    return [];
  }

  for (let page = 1; page <= MAX_PAGES && records.length < MAX_NUMBERS; page++) {
    const pageUrl = page === 1 ? startUrl : `${BASE_URL}/numbers/page/${page}`;

    let $;
    try {
      const result = await fetchHtml(pageUrl);
      $ = result.$;
    } catch (err) {
      console.warn(`[skipcalls] Failed to load page ${page}: ${err.message}`);
      break;
    }

    const phonePattern = /\+?1?\s*[\(\-\.]?\s*\d{3}\s*[\)\-\.]?\s*\d{3}[\-\.]\d{4}/g;
    const pageText = $.root().text();
    const phoneMatches = pageText.match(phonePattern) || [];

    // Also look for structured links
    $('a[href*="phone"], a[href*="number"], a[href*="/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/([\d\-+()]{7,20})(?:\/|$)/);
      if (match) phoneMatches.push(match[1]);
    });

    let foundOnPage = 0;
    for (const raw of phoneMatches) {
      if (records.length >= MAX_NUMBERS) break;
      const phone = normalizePhone(raw);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      records.push({
        phone_number: phone,
        source: SOURCE,
        spam_score: 6,
        call_type: 'other',
        country: 'US',
        report_count: 1,
        user_notes: '',
        date_first_seen: new Date().toISOString(),
        raw_data: '{}',
      });
      foundOnPage++;
    }

    console.log(`[skipcalls] Page ${page}: ${foundOnPage} new numbers`);
    if (foundOnPage === 0) break;
    await sleep(DELAY_MS);
  }

  console.log(`[skipcalls] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeSkipCalls };
