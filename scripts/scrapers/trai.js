'use strict';

/**
 * TRAI (India) spam number scraper
 * Scrapes publicly available India spam call reports and do-not-call data.
 * TRAI is the Telecom Regulatory Authority of India.
 */

const { fetchText, DELAY_MS, sleep } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE = 'trai';

// TRAI Public Data Sources
const SOURCES = [
  // TRAI publishes quarterly reports on unsolicited commercial communications
  'https://www.trai.gov.in/sites/default/files/ComplaintPDF/',
];

async function scrapeTrai() {
  const records = [];
  const seen = new Set();

  console.log(`[trai] Starting TRAI (India) spam list scrape...`);

  // Note: TRAI publishes quarterly reports on unsolicited commercial communications,
  // but the data format requires parsing PDF reports. For now, we rely on GitHub
  // community blocklists and other sources that have already aggregated Indian spam numbers.
  // These often include TRAI data plus crowdsourced reports.

  // If direct data becomes available in a machine-readable format, we'd implement it here:
  // const body = await fetchText(SOURCES[0]);
  // Parse body, extract phone numbers, normalize to E.164 format...

  console.log(`[trai] TRAI data currently not directly available. Returning 0 records.`);
  console.log(`[trai] Note: GitHub blocklists and other sources cover India numbers (+91 prefix).`);

  return records;
}

module.exports = { scrapeTrai };
