'use strict';

/**
 * GitHub community spam number list scraper
 * Downloads raw CSV/TXT files from public repositories containing
 * known spam/robocall number lists. No API key or authentication needed.
 */

const { fetchText } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE = 'github';

// Community-maintained spam number list files (raw GitHub URLs)
// Organized by region for proper country attribution
const RAW_URLS = [
  // US Sources
  {
    url: 'https://raw.githubusercontent.com/jwoertink/blocked-numbers/master/list.csv',
    hasHeader: false,
    phoneCol: 0,
    notesCol: 1,
    country: 'US',
  },
  // International Sources (placeholder URLs - expand as public lists become available)
  // Note: These URLs are examples. In production, use verified public blocklists:
  // - GitHub topic search: github.com/topics/spam-blocklist
  // - Public government registries when available in machine-readable format
  // - Community-maintained blocklists with permissive licenses
];

/**
 * Detect whether a line looks like a phone number (not an IP, not empty, etc.)
 */
function looksLikePhone(s) {
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Parse a body based on the source config.
 * Returns an array of { raw, notes } objects.
 */
function parseBody(srcConfig, body) {
  const { hasHeader = false, phoneCol = 0, notesCol = -1 } = srcConfig;

  const lines = body
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) return [];

  const firstLine = lines[0].toLowerCase();
  const isCSV = firstLine.includes(',') || firstLine.includes('\t');

  if (!isCSV) {
    // Plain TXT — one number per line
    return lines.filter(looksLikePhone).map(raw => ({ raw, notes: '' }));
  }

  const sep = firstLine.includes('\t') ? '\t' : ',';
  const dataLines = hasHeader ? lines.slice(1) : lines;

  // If it has a header, find the phone column by name
  let resolvedPhoneCol = phoneCol;
  let resolvedNotesCol = notesCol;
  if (hasHeader && lines.length > 0) {
    const headers = lines[0].split(sep).map(h => h.replace(/['"]/g, '').trim().toLowerCase());
    const found = headers.findIndex(h =>
      h === 'phone' || h === 'number' || h === 'tel' || h === 'phone_number'
    );
    if (found >= 0) resolvedPhoneCol = found;
  }

  return dataLines
    .map(line => {
      const parts = line.split(sep);
      const raw = (parts[resolvedPhoneCol] || '').replace(/['"]/g, '').trim();
      const notes = resolvedNotesCol >= 0
        ? (parts[resolvedNotesCol] || '').replace(/['"]/g, '').trim()
        : '';
      return { raw, notes };
    })
    .filter(({ raw }) => looksLikePhone(raw));
}

/**
 * Detect country from phone number prefix (E.164 format)
 * Returns the likely country code or the configured country
 */
function detectCountry(phone, configCountry) {
  if (!phone || !phone.startsWith('+')) return configCountry || 'US';

  const countryCode = phone.slice(1, phone.length).match(/^\d+/)[0];

  // Common country code mappings
  const countryMap = {
    '1': 'US',
    '44': 'UK',
    '91': 'India',
    '61': 'Australia',
    '33': 'France',
    '49': 'Germany',
    '39': 'Italy',
    '34': 'Spain',
    '31': 'Netherlands',
    '32': 'Belgium',
  };

  // If we have a specific config country, prefer it
  if (configCountry && configCountry !== 'Global') return configCountry;

  // Otherwise detect from prefix
  return countryMap[countryCode] || 'International';
}

async function scrapeGithubLists() {
  const records = [];
  const seen = new Set();

  for (const srcConfig of RAW_URLS) {
    const { url, country: configCountry } = srcConfig;
    const body = await fetchText(url, { timeout: 10000 });

    if (!body) {
      console.warn(`[github] Could not fetch ${url} (404 or error), skipping`);
      continue;
    }

    const entries = parseBody(srcConfig, body);
    let addedFromUrl = 0;

    for (const { raw, notes } of entries) {
      const phone = normalizePhone(raw);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      const detectedCountry = detectCountry(phone, configCountry);

      records.push({
        phone_number: phone,
        source: SOURCE,
        spam_score: 5,
        call_type: 'other',
        country: detectedCountry,
        report_count: 1,
        user_notes: notes || '',
        date_first_seen: new Date().toISOString(),
        raw_data: JSON.stringify({ url, configCountry }),
      });
      addedFromUrl++;
    }

    console.log(`[github] ${url.split('/').slice(-1)[0]}: ${addedFromUrl} numbers`);
  }

  console.log(`[github] Done — ${records.length} total records`);
  return records;
}

module.exports = { scrapeGithubLists };
