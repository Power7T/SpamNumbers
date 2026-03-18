'use strict';

/**
 * YouMail Robocall Index (robocallindex.com) scraper
 * Fetches the publicly available monthly top robocall number list.
 * Single fetch per run — no pagination needed.
 */

const { checkForBlock } = require('./base');
const { fetchWithStealth } = require('../lib/stealth-browser');
const { normalizePhone } = require('../normalizer');

const INDEX_URL = 'https://robocallindex.com/';
const SOURCE = 'youmail';

function rankToScore(rank, total) {
  if (total <= 1) return 10;
  return Math.max(5, 10 - ((rank - 1) / total) * 5);
}

async function scrapeYoumail() {
  // Block check removed, using stealth browser which bypasses Cloudflare

  let $;
  try {
    const result = await fetchWithStealth(INDEX_URL);
    $ = result.$;
  } catch (err) {
    console.warn(`[youmail] Failed to fetch index: ${err.message}`);
    return [];
  }

  const records = [];

  // Look for table rows or list items containing phone numbers
  const phonePattern = /\+?1?\s*[\(\-\.]?\s*\d{3}\s*[\)\-\.]?\s*\d{3}[\-\.]\d{4}/;

  const candidates = [];

  // Try table rows first
  $('table tr, tbody tr').each((_, row) => {
    const text = $(row).text();
    const match = text.match(phonePattern);
    if (match) {
      const cells = $(row).find('td');
      let volume = 0;
      cells.each((_, cell) => {
        const t = $(cell).text().replace(/,/g, '').trim();
        const n = parseFloat(t);
        if (!isNaN(n) && n > volume) volume = n;
      });
      candidates.push({ raw: match[0], volume });
    }
  });

  // Also try list items and divs
  if (candidates.length === 0) {
    $('li, [class*="number"], [class*="phone"], [class*="call"]').each((_, el) => {
      const text = $(el).text();
      const match = text.match(phonePattern);
      if (match) {
        candidates.push({ raw: match[0], volume: 1 });
      }
    });
  }

  const total = candidates.length;
  candidates.forEach(({ raw, volume }, idx) => {
    const phone = normalizePhone(raw);
    if (!phone) return;

    const rank = idx + 1;
    // Volume from YouMail is in millions of calls
    const reportCount = volume > 100 ? Math.round(volume * 1000000) : Math.max(1, volume);

    records.push({
      phone_number: phone,
      source: SOURCE,
      spam_score: rankToScore(rank, total),
      call_type: 'robocall',
      country: 'US',
      report_count: reportCount,
      user_notes: volume > 0 ? `YouMail monthly estimate: ${volume.toLocaleString()} calls` : '',
      date_first_seen: new Date().toISOString(),
      raw_data: JSON.stringify({ rank, volume }),
    });
  });

  console.log(`[youmail] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeYoumail };
