'use strict';

/**
 * OFCOM (UK) spam number scraper
 * Scrapes publicly available UK spam call reports and do-not-call lists.
 * OFCOM is the Office of Communications, the UK's independent regulator.
 */

const { fetchText, DELAY_MS, sleep } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE = 'ofcom';

// OFCOM Public Data Sources
const SOURCES = [
  // UK's Citizens Advice Consumer Service maintains a public complaint database
  'https://www.citizensadvice.org.uk/about-us/our-work/policy/policy-research-topics/post-and-communications-policy-research-and-consultation/post-and-communications-policy-research/communications/telecommunications-data/',
];

async function scrapeOfcom() {
  const records = [];
  const seen = new Set();

  console.log(`[ofcom] Starting OFCOM (UK) spam list scrape...`);

  // Note: OFCOM doesn't provide a public downloadable list in the format we need.
  // Their data is published via reports and API access that may require authentication.
  // For now, we return an empty array to maintain compatibility while future APIs are explored.

  // If OFCOM releases public data in the future, this is where we'd add it:
  // const body = await fetchText(SOURCES[0]);
  // Parse body and extract phone numbers...

  console.log(`[ofcom] OFCOM data currently not directly available via public API. Returning 0 records.`);
  console.log(`[ofcom] Note: Community GitHub blocklists and other sources cover UK numbers.`);

  return records;
}

module.exports = { scrapeOfcom };
