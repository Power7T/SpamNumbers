'use strict';

/**
 * Should I Answer (shouldianswer.com) scraper
 * Fetches the worst-rated phone numbers listing and individual number pages.
 */

const { sleep, DELAY_MS, checkForBlock } = require('./base');
const { fetchWithStealth } = require('../lib/stealth-browser');
const { normalizePhone, scoreFromCount } = require('../normalizer');

const BASE_URL = 'https://www.shouldianswer.com';
const SOURCE = 'shouldianswer';
const MAX_NUMBERS = 15;

// Rating to spam score mapping (these are negative/spam indicators)
const RATING_TO_SCORE = {
  'negative': 8,
  'dangerous': 9,
  'unsafe': 8,
  'neutral': 4,
  'positive': 1,
  'safe': 1,
};

function ratingToScore(ratingText) {
  if (!ratingText) return 5;
  const lower = ratingText.toLowerCase().trim();
  for (const [key, val] of Object.entries(RATING_TO_SCORE)) {
    if (lower.includes(key)) return val;
  }
  return 5;
}

function ratingToCallType(ratingText) {
  if (!ratingText) return 'other';
  const lower = ratingText.toLowerCase();
  if (lower.includes('robocall') || lower.includes('robot')) return 'robocall';
  if (lower.includes('scam') || lower.includes('fraud') || lower.includes('dangerous')) return 'scam';
  if (lower.includes('telemarket') || lower.includes('sales')) return 'telemarketer';
  if (lower.includes('debt') || lower.includes('collect')) return 'debt_collector';
  if (lower.includes('negative') || lower.includes('unsafe')) return 'scam';
  return 'other';
}

async function shouldIAnswer() {
  // Quick block check
  // Block check removed, using stealth browser which bypasses Cloudflare

  const records = [];

  // Try the worst-rated numbers listing
  let $;
  try {
    const result = await fetchWithStealth(`${BASE_URL}/worst-phones`);
    $ = result.$;
  } catch (err) {
    // Try the main page as fallback
    try {
      const result = await fetchWithStealth(BASE_URL);
      $ = result.$;
    } catch (err2) {
      console.warn(`[shouldianswer] Failed to load listing: ${err2.message}`);
      return [];
    }
  }

  // Collect phone number links
  const links = [];
  $('a[href*="/phone-number/"], a[href*="/phone/"]').each((_, el) => {
    const href = $( el).attr('href');
    if (href) links.push(href);
  });

  // Also look for number text directly in the listing
  $('[class*="phone"], [class*="number"]').each((_, el) => {
    const text = $(el).text().trim();
    const phone = normalizePhone(text);
    if (phone && links.length < MAX_NUMBERS) {
      // Push a synthetic link; we'll look up from text directly
    }
  });

  const uniqueLinks = [...new Set(links)].slice(0, MAX_NUMBERS);
  console.log(`[shouldianswer] Found ${uniqueLinks.length} number links`);

  for (const href of uniqueLinks) {
    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    // Extract phone from URL
    const phoneMatch = href.match(/\/([\d\-+().\s]{7,20})(?:\/|$)/);
    if (!phoneMatch) continue;
    const phone = normalizePhone(phoneMatch[1]);
    if (!phone) continue;

    let details = { rating: 'negative', reportCount: 1, notes: '', callType: 'other' };
    try {
      const { $ } = await fetchWithStealth(fullUrl);

      const ratingEl = $('[class*="rating"], [class*="score"], [class*="verdict"]').first().text().trim();
      const countEl = $('[class*="count"], [class*="report"]').first().text().trim();
      const countMatch = countEl.match(/(\d+)/);
      const comments = [];
      $('[class*="comment"], [class*="review"], [class*="post"]').each((_, el) => {
        const t = $(el).text().trim().replace(/\s+/g, ' ').slice(0, 200);
        if (t.length > 10) comments.push(t);
      });

      details.rating = ratingEl;
      details.reportCount = countMatch ? parseInt(countMatch[1], 10) : 1;
      details.notes = comments.slice(0, 3).join(' | ');
      details.callType = ratingToCallType(ratingEl);
    } catch (_) { /* use defaults */ }

    records.push({
      phone_number: phone,
      source: SOURCE,
      spam_score: ratingToScore(details.rating),
      call_type: details.callType,
      country: 'US',
      report_count: details.reportCount,
      user_notes: details.notes,
      date_first_seen: new Date().toISOString(),
      raw_data: JSON.stringify({ url: fullUrl }),
    });

    await sleep(DELAY_MS);
  }

  console.log(`[shouldianswer] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeShouldIAnswer: shouldIAnswer };
