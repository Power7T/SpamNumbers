'use strict';

/**
 * 800notes.com scraper
 * Scrapes category listing pages to find recently reported numbers,
 * then visits each number's page to collect report count and comments.
 */

const { sleep, DELAY_MS, checkForBlock } = require('./base');
const { fetchWithStealth } = require('../lib/stealth-browser');
const { normalizePhone, normalizeCallType, scoreFromCount } = require('../normalizer');

const BASE_URL = 'https://800notes.com';
const SOURCE = '800notes';

const CATEGORIES = [
  { path: '/Cat.aspx/Robocall',       callType: 'robocall' },
  { path: '/Cat.aspx/Telemarketing',  callType: 'telemarketer' },
  { path: '/Cat.aspx/Scam',           callType: 'scam' },
  { path: '/Cat.aspx/Debt-Collector', callType: 'debt_collector' },
];

const MAX_PAGES_PER_CAT = 2;
const MAX_NUMBERS_PER_RUN = 30;

async function scrapeNumberPage(url, callType) {
  try {
    const { $, text: _ } = await fetchWithStealth(url);

    // Extract report count
    const countText = $('.phone-number-details, .numreviews, .cnt, [class*="count"]').first().text() || '';
    const countMatch = countText.match(/(\d+)/);
    const reportCount = countMatch ? parseInt(countMatch[1], 10) : 1;

    // Extract user comments
    const comments = [];
    $('[class*="comment"], [class*="post"], [class*="review"], .comment_text, .post_body').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ').slice(0, 200);
      if (text.length > 10) comments.push(text);
    });

    return {
      report_count: reportCount,
      user_notes: comments.slice(0, 3).join(' | '),
      call_type: callType,
    };
  } catch (err) {
    return { report_count: 1, user_notes: '', call_type: callType };
  }
}

async function scrapeEightHundredNotes() {
  // Block check removed, using stealth browser which bypasses Cloudflare

  const records = [];
  const seen = new Set();

  for (const { path, callType } of CATEGORIES) {
    if (records.length >= MAX_NUMBERS_PER_RUN) break;

    for (let page = 1; page <= MAX_PAGES_PER_CAT; page++) {
      if (records.length >= MAX_NUMBERS_PER_RUN) break;

      const pageUrl = `${BASE_URL}${path}${page > 1 ? `?page=${page}` : ''}`;
      let $;
      try {
        const result = await fetchWithStealth(pageUrl);
        $ = result.$;
      } catch (err) {
        console.warn(`[800notes] Failed to load ${pageUrl}: ${err.message}`);
        break;
      }

      // Find links to individual number pages
      const numberLinks = [];
      $('a[href*="/Phone.aspx/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !seen.has(href)) {
          numberLinks.push(href);
          seen.add(href);
        }
      });

      if (numberLinks.length === 0) break;

      for (const href of numberLinks.slice(0, 10)) {
        if (records.length >= MAX_NUMBERS_PER_RUN) break;

        // Extract phone from URL pattern like /Phone.aspx/1-800-555-1234
        const phoneMatch = href.match(/\/Phone\.aspx\/([\d\-+().\s]+)/i);
        if (!phoneMatch) continue;
        const phone = normalizePhone(phoneMatch[1].replace(/-/g, ''));
        if (!phone) continue;

        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        const details = await scrapeNumberPage(fullUrl, callType);

        records.push({
          phone_number: phone,
          source: SOURCE,
          spam_score: scoreFromCount(details.report_count),
          call_type: details.call_type,
          country: 'US',
          report_count: details.report_count,
          user_notes: details.user_notes,
          date_first_seen: new Date().toISOString(),
          raw_data: JSON.stringify({ url: fullUrl }),
        });

        await sleep(DELAY_MS);
      }

      await sleep(DELAY_MS);
    }
  }

  console.log(`[800notes] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeEightHundredNotes };
