'use strict';

/**
 * Nomorobo top robocallers scraper
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone, normalizeCallType, scoreFromCount } = require('../normalizer');

const BASE_URL = 'https://www.nomorobo.com';
const SOURCE = 'nomorobolist';
const MAX_NUMBERS = 25;

async function scrapeNomoroboList() {
  const records = [];
  const seen = new Set();

  // Public pages listing top reported numbers
  const listingPaths = [
    '/lookup',
    '/robocaller',
    '/',
  ];

  let $ = null;
  let bodyText = '';

  for (const path of listingPaths) {
    try {
      const url = `${BASE_URL}${path}`;
      const result = await fetchWithStealth(url);
      const text = result.$.root().text();
      if (/\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4}/.test(text) || /\(\d{3}\)\s*\d{3}/.test(text)) {
        $ = result.$;
        bodyText = text;
        break;
      }
    } catch (_) { continue; }
  }

  if (!$ || !bodyText) {
    console.warn('[nomorobolist] No accessible listing page found, skipping');
    return [];
  }

  // Extract phone numbers from page text
  const phonePattern = /(?:\+?1[\s\-\.]?)?\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/g;
  const inlineMatches = bodyText.match(phonePattern) || [];

  for (const raw of inlineMatches) {
    if (records.length >= MAX_NUMBERS) break;
    const phone = normalizePhone(raw);
    if (phone && !seen.has(phone)) {
      seen.add(phone);
      records.push({
        phone_number: phone,
        source: SOURCE,
        spam_score: 7,
        call_type: 'robocall',
        country: 'US',
        report_count: 1,
        user_notes: '',
        date_first_seen: new Date().toISOString(),
        raw_data: '{}',
      });
    }
  }

  // Collect phone number links
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/\/lookup\/[\d\-+()]{7,}/.test(href)) {
      links.push(href);
    }
  });

  const uniqueLinks = [...new Set(links)].slice(0, MAX_NUMBERS);
  for (const href of uniqueLinks) {
    if (records.length >= MAX_NUMBERS) break;

    const phoneMatch = href.match(/([\d\-+()\s]{7,20})(?:\/|$)/);
    if (!phoneMatch) continue;
    const phone = normalizePhone(phoneMatch[1]);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);

    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    let reportCount = 1;
    let callType = 'robocall';
    let notes = '';

    try {
      const result = await fetchWithStealth(fullUrl);
      const detail$ = result.$;

      const countText = detail$('[class*="count"], [class*="report"], [class*="total"]').first().text();
      const countMatch = countText.match(/(\d+)/);
      if (countMatch) reportCount = Math.max(1, parseInt(countMatch[1], 10));

      const typeText = detail$('[class*="type"], [class*="category"], [class*="tag"]').first().text().trim();
      callType = normalizeCallType(typeText) || 'robocall';

      const noteEls = [];
      detail$('[class*="comment"], [class*="description"], [class*="report"]').each((_, el) => {
        const t = detail$(el).text().trim().replace(/\s+/g, ' ').slice(0, 200);
        if (t.length > 20) noteEls.push(t);
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

  console.log(`[nomorobolist] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeNomoroboList };
