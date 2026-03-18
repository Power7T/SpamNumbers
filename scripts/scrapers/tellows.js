'use strict';

/**
 * Tellows (tellows.com) scraper
 */

const { fetchWithStealth } = require('../lib/stealth-browser');
const { sleep, DELAY_MS } = require('./base');
const { normalizePhone, scoreFromCount } = require('../normalizer');

const SOURCE = 'tellows';
const MAX_NUMBERS = 100;

async function scrapeTellows() {
  const records = [];
  const seen = new Set();

  const TELLOWS_DOMAINS = [
    // North America & UK (The most reliable)
    'https://www.tellows.com/', 'https://www.tellows.co.uk/',
    // Europe (Core hubs)
    'https://www.tellows.de/', 'https://www.tellows.it/', 'https://www.tellows.fr/', 
    'https://www.tellows.es/', 'https://www.tellows.at/', 'https://www.tellows.ch/',
    'https://www.tellows.pl/', 'https://www.tellows.be/',
    // Active Emerging Markets
    'https://www.tellows.com.br/', 'https://www.tellows.com.mx/', 'https://www.tellows.in/', 
    'https://www.tellows.co.za/'
  ];

  // Randomly select 5 massive global domains per scrape to avoid extreme rate limiting
  const shuffledDomains = TELLOWS_DOMAINS.sort(() => 0.5 - Math.random()).slice(0, 5);
  console.log(`[tellows] Scanning global regions: ${shuffledDomains.map(d => d.replace('https://www.tellows.', '')).join(', ')}`);

  const listingUrls = shuffledDomains.flatMap(domain => [
    `${domain}`,
    `${domain}statistics/most-searched-numbers`,
    `${domain}recent-comments`
  ]);


  for (const url of listingUrls) {
    if (records.length >= MAX_NUMBERS) break;

    let $, text;
    try {
      ({ $, text } = await fetchWithStealth(url));
    } catch (err) {
      console.warn(`[tellows] Could not connect to region: ${url}. Error: ${err.message}`);
      continue;
    }
    
    // Look for links to phone numbers or raw numbers in text
    const links = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (/\/num\//.test(href) || /\/number\//.test(href)) {
          links.push(href);
        }
      });

      const uniqueLinks = [...new Set(links)];

      // Determine the base url of the page we just scraped
      const urlObj = new URL(url);
      const currentBaseUrl = `${urlObj.protocol}//${urlObj.hostname}`;

      for (let href of uniqueLinks) {
        if (records.length >= MAX_NUMBERS) break;

        const fullUrl = href.startsWith('http') ? href : `${currentBaseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
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

  console.log(`[tellows] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeTellows };
