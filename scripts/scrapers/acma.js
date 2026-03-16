'use strict';

/**
 * ACMA (Australia) spam number scraper
 * Scrapes publicly available Australia spam call reports.
 * ACMA is the Australian Communications and Media Authority.
 */

const { fetchText, DELAY_MS, sleep } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE = 'acma';

// ACMA Public Data Sources
const SOURCES = [
  // ACMA publishes data about scams and unwanted calls
  'https://www.acma.gov.au/consumer-advice-and-complaints/scams-and-unwanted-calls',
];

async function scrapeAcma() {
  const records = [];
  const seen = new Set();

  console.log(`[acma] Starting ACMA (Australia) spam list scrape...`);

  // Note: ACMA publishes guidance on scam numbers and unwanted calls on their website,
  // but doesn't provide a direct downloadable list in machine-readable format.
  // The data is published via news alerts, complaints statistics, and advisory pages.
  // GitHub community blocklists provide the aggregated Australian spam data.

  // If ACMA releases a public API or downloadable dataset, we'd implement it here:
  // const body = await fetchText(SOURCES[0]);
  // Parse body, extract phone numbers, normalize to E.164 format (+61)...

  console.log(`[acma] ACMA data currently not directly available. Returning 0 records.`);
  console.log(`[acma] Note: GitHub blocklists and other sources cover Australia numbers (+61 prefix).`);

  return records;
}

module.exports = { scrapeAcma };
