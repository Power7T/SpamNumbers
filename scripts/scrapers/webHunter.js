'use strict';

/**
 * Web Hunter OSINT Discovery Engine
 * 
 * Automatically "Hunts" for new spam numbers from the open web (Gists, Pastebin, Forums)
 * using search operators (Dorks) and autonomous text extraction.
 */

const { fetchText, sleep, fetchWithHeaders } = require('./base');
const { normalizePhone } = require('../normalizer');
const { getBrowser, closeStealthBrowser } = require('../lib/stealth-browser');

const SOURCE = 'web_hunter';

/**
 * Robust Regex for Worldwide Phone Number Discovery
 * Matches: +91-XXX, (XXX) XXX-XXXX, XXX.XXX.XXXX, etc.
 */
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;

/**
 * Keywords that confirm a discovery page is a "Spam List"
 */
const SPAM_KEYWORDS = ['scam', 'fraud', 'robocall', 'telemarketer', 'blocklist', 'spam list', 'irs', 'police', 'warranty'];

async function hunt(db) {
  console.log('[web_hunter] Initializing AGGRESSIVE Autonomous Discovery...');
  
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  // GOLDMINE TARGETS (Pages updated every hour with new complaints/lists)
  const discoveryTargets = [
    'https://800notes.com',
    'https://whocallsme.com',
    'https://www.spamcalls.net/en/',
    'https://github.com/topics/spam-blocklist?o=desc&s=updated',
    'https://github.com/topics/phone-numbers?o=desc&s=updated'
  ];

  const records = [];
  const seenInRun = new Set();

  for (const targetUrl of discoveryTargets) {
    try {
      console.log(`[web_hunter]   🏹 Attacking: ${targetUrl}`);
      
      // For forums, we need to handle the main page where recent numbers are listed
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);

      // Extract EVERYTHING from the page text
      const pageText = await page.evaluate(() => document.body.innerText);
      const matches = pageText.match(PHONE_REGEX) || [];
      const distinct = [...new Set(matches)];

      let addedFromPage = 0;
      for (const rawNum of distinct) {
        const phone = normalizePhone(rawNum);
        if (!phone || seenInRun.has(phone)) continue;
        seenInRun.add(phone);

        records.push({
          phone_number: phone,
          source: SOURCE,
          spam_score: 7, 
          call_type: 'live_report',
          country: 'Global',
          report_count: 1,
          user_notes: `Discovered on live OSINT feed: ${targetUrl.split('/')[2]}`,
          date_first_seen: new Date().toISOString(),
          raw_data: JSON.stringify({ discovered_via: targetUrl }),
        });
        addedFromPage++;
      }

      console.log(`[web_hunter]     ✓ Vacuumed ${addedFromPage} numbers from ${targetUrl.split('/')[2]}`);
      
      // If it's a GitHub Topic, also find repository links to crawl deeper
      if (targetUrl.includes('github.com')) {
         const repoLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
              .map(a => a.href)
              .filter(href => href.includes('github.com/') && !href.includes('/topics') && href.split('/').length === 5);
         });

         for (const repoUrl of repoLinks.slice(0, 3)) {
            console.log(`[web_hunter]       📂 Deep-Crawling Repo: ${repoUrl.split('/').slice(-2).join('/')}`);
            // Try common raw paths
            const rawSeeds = [
               repoUrl.replace('github.com', 'raw.githubusercontent.com') + '/main/numbers.txt',
               repoUrl.replace('github.com', 'raw.githubusercontent.com') + '/master/numbers.txt',
               repoUrl.replace('github.com', 'raw.githubusercontent.com') + '/main/blacklist.csv'
            ];

            for (const seed of rawSeeds) {
               const body = await fetchText(seed, { timeout: 10000 });
               if (!body) continue;
               const subMatches = body.match(PHONE_REGEX) || [];
               for (const m of subMatches) {
                  const p = normalizePhone(m);
                  if (p && !seenInRun.has(p)) {
                     seenInRun.add(p);
                     records.push({
                        phone_number: p,
                        source: SOURCE,
                        spam_score: 5,
                        call_type: 'discovery',
                        country: 'Global',
                        report_count: 1,
                        user_notes: `Found in discovered repo: ${repoUrl}`,
                        date_first_seen: new Date().toISOString(),
                        raw_data: JSON.stringify({ repo: repoUrl }),
                     });
                  }
               }
            }
         }
      }

      await sleep(2000); // Politeness

    } catch (err) {
      console.warn(`[web_hunter]   ⚠ Attack failed for ${targetUrl}: ${err.message}`);
    }
  }

  console.log(`[web_hunter] Done — Vacuumed ${records.length} total numbers from the live web.`);
  return records;
}

module.exports = { hunt };
