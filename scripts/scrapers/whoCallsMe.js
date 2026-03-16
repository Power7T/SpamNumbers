'use strict';

/**
 * WhoCallsMe.com scraper
 * A crowdsourced US phone number report database.
 */

const { checkForBlock, fetchHtml, sleep, DELAY_MS } = require('./base');
const { normalizePhone, normalizeCallType, scoreFromCount } = require('../normalizer');

const BASE_URL = 'https://www.whocallsme.com';
const SOURCE = 'whocallsme';
const MAX_NUMBERS = 20;

async function scrapeWhoCallsMe() {
  const blockCheck = await checkForBlock(`${BASE_URL}/`);
  if (blockCheck.blocked) {
    console.warn(`[whocallsme] Blocked (HTTP ${blockCheck.status}), skipping`);
    return [];
  }

  const records = [];
  const seen = new Set();

  // Try several listing entry points
  const listingPaths = [
    '/recent-calls',
    '/Phone-Number.aspx',
    '/',
  ];

  let $listing = null;
  for (const path of listingPaths) {
    try {
      const url = `${BASE_URL}${path}`;
      const result = await fetchHtml(url);
      const bodyText = result.$.root().text();
      if (/\d{3}[\-\.]\d{3}[\-\.]\d{4}/.test(bodyText)) {
        $listing = result.$;
        break;
      }
    } catch (_) { continue; }
  }

  if (!$listing) {
    console.warn('[whocallsme] No listing page accessible, skipping');
    return [];
  }

  // Collect phone number links
  const links = [];
  $listing('a[href*="Phone-Number"], a[href*="phone"], a[href*="/"]').each((_, el) => {
    const href = $listing(el).attr('href') || '';
    if (/\d{7,}/.test(href) || /\d{3}[\-\.]\d{3}[\-\.]\d{4}/.test(href)) {
      links.push(href);
    }
  });

  // Also scan for phone numbers in text
  const phonePattern = /\+?1?\s*[\(\-\.]?\s*\d{3}\s*[\)\-\.]?\s*\d{3}[\-\.]\d{4}/g;
  const bodyText = $listing.root().text();
  const inlinePhones = bodyText.match(phonePattern) || [];

  for (const raw of inlinePhones.slice(0, MAX_NUMBERS)) {
    const phone = normalizePhone(raw);
    if (phone && !seen.has(phone)) {
      seen.add(phone);
      records.push({
        phone_number: phone,
        source: SOURCE,
        spam_score: 5,
        call_type: 'other',
        country: 'US',
        report_count: 1,
        user_notes: '',
        date_first_seen: new Date().toISOString(),
        raw_data: '{}',
      });
    }
  }

  // Visit individual number pages for more detail
  const uniqueLinks = [...new Set(links)].slice(0, MAX_NUMBERS);
  for (const href of uniqueLinks) {
    if (records.length >= MAX_NUMBERS) break;

    const phoneMatch = href.match(/([\d\-+()]{7,20})(?:\.aspx|\/|$)/i);
    if (!phoneMatch) continue;
    const phone = normalizePhone(phoneMatch[1]);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);

    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    let reportCount = 1;
    let notes = '';
    let callType = 'other';

    try {
      const { $ } = await fetchHtml(fullUrl);
      const countText = $('[class*="count"], [class*="report"], .cnt').first().text();
      const countMatch = countText.match(/(\d+)/);
      if (countMatch) reportCount = parseInt(countMatch[1], 10);

      const typeText = $('[class*="type"], [class*="category"], [class*="label"]').first().text().trim();
      callType = normalizeCallType(typeText) || 'other';

      const commentEls = [];
      $('[class*="comment"], [class*="post"], [class*="text"]').each((_, el) => {
        const t = $(el).text().trim().replace(/\s+/g, ' ').slice(0, 200);
        if (t.length > 10) commentEls.push(t);
      });
      notes = commentEls.slice(0, 3).join(' | ');
    } catch (_) { /* use defaults */ }

    records.push({
      phone_number: phone,
      source: SOURCE,
      spam_score: scoreFromCount(reportCount),
      call_type: callType,
      country: 'US',
      report_count: reportCount,
      user_notes: notes,
      date_first_seen: new Date().toISOString(),
      raw_data: JSON.stringify({ url: fullUrl }),
    });

    await sleep(DELAY_MS);
  }

  console.log(`[whocallsme] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeWhoCallsMe };
