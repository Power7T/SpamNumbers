'use strict';

/**
 * Tellows (tellows.com) scraper
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone, scoreFromCount } = require('../normalizer');

const BASE_URL = 'https://www.tellows.com';
const SOURCE = 'tellows';
const MAX_NUMBERS = 30;

async function scrapeTellows() {
  const records = [];
  const seen = new Set();

  const listingUrls = [
    `${BASE_URL}/statistics/most-searched-numbers`,
    `${BASE_URL}/en/recent-comments`,
    'https://www.tellows.co.uk/',
    'https://www.tellows.de/',
    'https://www.tellows.it/',
    'https://www.tellows.fr/',
    'https://www.tellows.es/',
    'https://www.tellows.com.br/',
    'https://www.tellows.com.mx/',
  ];

  try {
    for (const url of listingUrls) {
      if (records.length >= MAX_NUMBERS) break;

      const { $, text } = await fetchWithStealth(url);
      
      // Look for links to phone numbers or raw numbers in text
      const links = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (/\/num\//.test(href) || /\/number\//.test(href)) {
          links.push(href);
        }
      });

      const uniqueLinks = [...new Set(links)];

      for (let href of uniqueLinks) {
        if (records.length >= MAX_NUMBERS) break;

        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        // Extract number from URL (e.g. /num/01234 or /num/US/1234)
        const phoneMatch = href.match(/[\d\-+()]{7,20}/);
        if (!phoneMatch) continue;
        
        const phone = normalizePhone(phoneMatch[0]);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);

        try {
          const { $ } = await fetchWithStealth(fullUrl);
          
          const scoreText = $('.tellows-score, [class*="score"]').first().text().trim();
          const score = parseInt(scoreText, 10) || 7;
          
          const typeText = $('.category, [class*="type"]').first().text().trim();
          const callType = typeText.toLowerCase().includes('telemarketing') ? 'telemarketer' : 'scam';
          
          const reportsText = $('.num-searches, [class*="search"], [class*="report"]').first().text().match(/(\d+)/);
          const reports = reportsText ? parseInt(reportsText[1], 10) : 1;

          const notes = [];
          $('.comment-body, [class*="comment"], [class*="review"]').each((_, el) => {
            const t = $(el).text().trim().replace(/\s+/g, ' ').slice(0, 200);
            if (t.length > 20) notes.push(t);
          });

          records.push({
            phone_number: phone,
            source: SOURCE,
            spam_score: Math.min(10, score),
            call_type: callType,
            country: 'Global',
            report_count: reports,
            user_notes: notes.slice(0, 2).join(' | '),
            date_first_seen: new Date().toISOString(),
            raw_data: JSON.stringify({ url: fullUrl }),
          });
        } catch (_) { /* skip */ }

        await sleep(DELAY_MS);
      }
    }
  } catch (err) {
    console.warn(`[tellows] Error: ${err.message}`);
  }

  console.log(`[tellows] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeTellows };
