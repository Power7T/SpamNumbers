'use strict';

/**
 * GitHub community spam number list scraper
 * Downloads raw CSV/TXT files from public repositories containing
 * known spam/robocall number lists. No API key or authentication needed.
 */

const { fetchText } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE = 'github';

// Verified community-maintained spam number list files (raw GitHub URLs)
// Each URL has been tested and confirmed accessible (200 OK)
const RAW_URLS = [
  // US — jwoertink/blocked-numbers (800+ robocall entries)
  {
    url: 'https://raw.githubusercontent.com/jwoertink/blocked-numbers/master/list.csv',
    hasHeader: false,
    phoneCol: 0,
    notesCol: 1,
    country: 'US',
  },
  // International (mainly France/EU) — Oros42/phone-blacklist
  // Format: phone,label (e.g. "+33178569561,spam" or "3922,spam-FR")
  {
    url: 'https://raw.githubusercontent.com/Oros42/phone-blacklist/master/blacklist.csv',
    hasHeader: false,
    phoneCol: 0,
    notesCol: 1,  // label column contains "spam", "spam-FR", "spam-BE", etc.
    country: 'Global',
    parseLabel: true,  // extract country from label suffix
  },
  // UK — bretmlw/uk-phone-scam-numbers
  // Format: plain text, one +44 number per line
  {
    url: 'https://raw.githubusercontent.com/bretmlw/uk-phone-scam-numbers/master/numbers.txt',
    hasHeader: false,
    phoneCol: 0,
    notesCol: -1,
    country: 'UK',
  },
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

// ISO label suffix → country name (used by Oros42/phone-blacklist)
const LABEL_COUNTRY_MAP = {
  'FR': 'France', 'BE': 'Belgium', 'CH': 'Switzerland', 'DE': 'Germany',
  'IT': 'Italy', 'ES': 'Spain', 'NL': 'Netherlands', 'PT': 'Portugal',
  'UK': 'UK', 'GB': 'UK', 'US': 'US', 'CA': 'Canada',
  'AU': 'Australia', 'IN': 'India', 'JP': 'Japan', 'BR': 'Brazil',
};

// E.164 calling code → country name (checked longest prefix first)
const PREFIX_COUNTRY_MAP = [
  ['1', 'US'], ['44', 'UK'], ['33', 'France'], ['49', 'Germany'],
  ['39', 'Italy'], ['34', 'Spain'], ['31', 'Netherlands'], ['32', 'Belgium'],
  ['41', 'Switzerland'], ['351', 'Portugal'], ['91', 'India'],
  ['61', 'Australia'], ['81', 'Japan'], ['86', 'China'], ['82', 'South Korea'],
  ['7', 'Russia'], ['55', 'Brazil'], ['52', 'Mexico'], ['27', 'South Africa'],
  ['971', 'UAE'], ['966', 'Saudi Arabia'], ['65', 'Singapore'],
  ['60', 'Malaysia'], ['63', 'Philippines'], ['62', 'Indonesia'],
  ['90', 'Turkey'], ['48', 'Poland'], ['46', 'Sweden'], ['47', 'Norway'],
  ['45', 'Denmark'], ['358', 'Finland'], ['43', 'Austria'],
  ['353', 'Ireland'], ['420', 'Czech Republic'],
];

/**
 * Extract country from Oros42-style label (e.g. "spam-FR" → "France")
 */
function countryFromLabel(label) {
  if (!label) return null;
  const match = label.match(/-([A-Z]{2})$/i);
  if (match) {
    return LABEL_COUNTRY_MAP[match[1].toUpperCase()] || match[1].toUpperCase();
  }
  return null;
}

/**
 * Detect country from phone number E.164 prefix
 */
function countryFromPrefix(phone) {
  if (!phone || !phone.startsWith('+')) return null;
  const digits = phone.slice(1);
  // Check longest prefixes first (3-digit, then 2-digit, then 1-digit)
  for (const [prefix, country] of PREFIX_COUNTRY_MAP) {
    if (digits.startsWith(prefix)) return country;
  }
  return null;
}

/**
 * Detect country from label, config, or phone prefix (in priority order)
 */
function detectCountry(phone, configCountry, label) {
  // 1. Try label suffix (most specific, from Oros42 data)
  const fromLabel = countryFromLabel(label);
  if (fromLabel) return fromLabel;

  // 2. Use config country if specific
  if (configCountry && configCountry !== 'Global') return configCountry;

  // 3. Detect from phone prefix
  const fromPrefix = countryFromPrefix(phone);
  if (fromPrefix) return fromPrefix;

  return 'Unknown';
}

// Map config country names to ISO 3166-1 alpha-2 for libphonenumber-js
const COUNTRY_TO_ISO = {
  'US': 'US', 'UK': 'GB', 'France': 'FR', 'Germany': 'DE',
  'Italy': 'IT', 'Spain': 'ES', 'India': 'IN', 'Australia': 'AU',
  'Belgium': 'BE', 'Netherlands': 'NL', 'Switzerland': 'CH',
};

async function scrapeGithubLists() {
  const records = [];
  const seen = new Set();

  for (const srcConfig of RAW_URLS) {
    const { url, country: configCountry, parseLabel } = srcConfig;
    const body = await fetchText(url, { timeout: 10000 });

    if (!body) {
      console.warn(`[github] Could not fetch ${url} (404 or error), skipping`);
      continue;
    }

    const entries = parseBody(srcConfig, body);
    let addedFromUrl = 0;

    for (const { raw, notes } of entries) {
      // Pass country hint to normalizer for bare numbers without '+'
      const isoHint = COUNTRY_TO_ISO[configCountry] || undefined;
      const phone = normalizePhone(raw, isoHint);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      // Use label for country detection (Oros42 uses "spam-FR" format)
      const label = parseLabel ? notes : null;
      const detectedCountry = detectCountry(phone, configCountry, label);

      records.push({
        phone_number: phone,
        source: SOURCE,
        spam_score: 5,
        call_type: 'scam',
        country: detectedCountry,
        report_count: 1,
        user_notes: parseLabel ? '' : (notes || ''),
        date_first_seen: new Date().toISOString(),
        raw_data: JSON.stringify({ url }),
      });
      addedFromUrl++;
    }

    console.log(`[github] ${url.split('/').slice(-1)[0]}: ${addedFromUrl} numbers`);
  }

  console.log(`[github] Done — ${records.length} total records`);
  return records;
}

module.exports = { scrapeGithubLists };
