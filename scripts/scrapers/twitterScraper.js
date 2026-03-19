'use strict';

const { fetchText, sleep, extractPhoneNumbers } = require('./base');
const cheerio = require('cheerio');

/**
 * Scrape Twitter via Nitter (no API keys required)
 * Targeted keywords: "scam call", "robocall", "scammer", "fraud number"
 */
async function scrapeSocialOSINT() {
  const instances = [
    'https://nitter.net',
    'https://nitter.cz',
    'https://nitter.it',
    'https://nitter.privacydev.net'
  ];
  
  const keywords = ['"scam call"', '"robocall"', '"scammer" phone', '"fraud number"'];
  const allRecords = [];

  for (const keyword of keywords) {
    // Try multiple instances in case one is rate-limited
    for (const baseUrl of instances) {
      try {
        const url = `${baseUrl}/search?f=tweets&q=${encodeURIComponent(keyword)}`;
        console.log(`[social_hunter] Searching ${baseUrl} for ${keyword}...`);
        
        const html = await fetchText(url, { timeout: 15000 });
        if (!html || html.includes('Rate limit exceeded')) continue;

        const $ = cheerio.load(html);
        const tweets = $('.timeline-item');
        
        tweets.each((_, el) => {
          const content = $(el).find('.tweet-content').text();
          const date = $(el).find('.tweet-date a').attr('title');
          const author = $(el).find('.username').text();
          
          const numbers = extractPhoneNumbers(content);
          for (const num of numbers) {
            allRecords.push({
              phone_number: num,
              source: 'social_hunter',
              spam_score: 8.0, // Real-time social reports are high signal
              call_type: content.toLowerCase().includes('amazon') ? 'impersonation' : 'scam',
              report_count: 1,
              user_notes: `Twitter report by ${author}: ${content.slice(0, 200)}...`,
              date_first_seen: date || new Date().toISOString(),
              raw_data: JSON.stringify({ author, content, date })
            });
          }
        });

        // If we got results, move to next keyword
        if (tweets.length > 0) break;
        
      } catch (err) {
        console.warn(`[social_hunter] ${baseUrl} failed: ${err.message}`);
      }
      await sleep(1000);
    }
  }

  // Deduplicate within this source
  const seen = new Set();
  const unique = allRecords.filter(r => {
    if (seen.has(r.phone_number)) return false;
    seen.add(r.phone_number);
    return true;
  });

  console.log(`[social_hunter] Discovered ${unique.length} live threats from Twitter OSINT`);
  return unique;
}

module.exports = { scrapeSocialOSINT };
