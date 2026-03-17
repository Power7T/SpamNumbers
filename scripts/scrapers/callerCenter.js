'use strict';

/**
 * CallerCenter.com scraper
 * Community reverse phone lookup — crowdsourced US spam reports.
 * No Cloudflare protection. Extracts recent reported numbers from listing pages.
 */

const { checkForBlock, fetchHtml, sleep, DELAY_MS } = require('./base');
const { normalizePhone, normalizeCallType, scoreFromCount } = require('../normalizer');

const BASE_URL = 'https://www.callercenter.com';
const SOURCE = 'callercenter';
const MAX_NUMBERS = 25;

async function scrapeCallerCenter() {
  const blockCheck = await checkForBlock(`${BASE_URL}/`);
  if (blockCheck.blocked) {
    console.warn(`[callercenter] Blocked (HTTP ${blockCheck.status}), skipping`);
    return [];
  }

  const records = [];
  const seen = new Set();

  // Try listing pages that typically show recently reported numbers
  const listingPaths = [
    '/recent-reports',
    '/latest',
    '/phone-report',
    '/',
  ];

  let listingText = null;
  let listingHtml = null;

  for (const path of listingPaths) {
    try {
      const url = `${BASE_URL}${path}`;
      const result = await fetchHtml(url);
      const bodyText = result.$.root().text();
      // Check if the page actually contains phone number patterns
      if (/\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4}/.test(bodyText) || /\(\d{3}\)\s*\d{3}/.test(bodyText)) {
        listingHtml = result.$;
        listingText = bodyText;
        break;
      }
    } catch (_) { continue; }
  }

  if (!listingHtml || !listingText) {
    console.warn('[callercenter] No accessible listing page found, skipping');
    return [];
  }

  // Extract phone numbers directly from the page text via regex
  const phonePattern = /(?:\+?1[\s\-\.]?)?\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/g;
  const inlineMatches = listingText.match(phonePattern) || [];

  for (const raw of inlineMatches) {
    if (records.length >= MAX_NUMBERS) break;
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

  // Collect phone number links for detail pages
  const links = [];
  listingHtml('a[href]').each((_, el) => {
    const href = listingHtml(el).attr('href') || '';
    if (/\d{7,}/.test(href) || /\d{3}[-_.]\d{3}[-_.]\d{4}/.test(href)) {
      links.push(href);
    }
  });

  // Visit detail pages for more metadata
  const uniqueLinks = [...new Set(links)].slice(0, MAX_NUMBERS);
  for (const href of uniqueLinks) {
    if (records.length >= MAX_NUMBERS) break;

    // Extract phone from the URL path
    const rawFromUrl = href.replace(/[^0-9+]/g, ' ').trim();
    const phone = normalizePhone(rawFromUrl);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);

    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    let reportCount = 1;
    let callType = 'other';
    let notes = '';

    try {
      const { $ } = await fetchHtml(fullUrl);

      // Report count
      const countText = $('[class*="count"], [class*="report"], [class*="total"]').first().text();
      const countMatch = countText.match(/(\d+)/);
      if (countMatch) reportCount = Math.max(1, parseInt(countMatch[1], 10));

      // Call type
      const typeText = $('[class*="type"], [class*="category"], [class*="tag"], [class*="label"]').first().text().trim();
      callType = normalizeCallType(typeText) || 'other';

      // User comments/notes
      const noteEls = [];
      $('[class*="comment"], [class*="review"], [class*="report"]').each((_, el) => {
        const t = $(el).text().trim().replace(/\s+/g, ' ').slice(0, 200);
        if (t.length > 10) noteEls.push(t);
      });
      notes = noteEls.slice(0, 3).join(' | ');
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

  console.log(`[callercenter] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeCallerCenter };
