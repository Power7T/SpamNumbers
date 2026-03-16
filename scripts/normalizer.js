'use strict';

const { parsePhoneNumber, isValidPhoneNumber } = require('libphonenumber-js');

// Canonical call types
const CALL_TYPES = new Set(['robocall', 'telemarketer', 'scam', 'debt_collector', 'other']);

// Mapping of raw source strings to canonical call types
const CALL_TYPE_MAP = [
  [/robocall/i,                           'robocall'],
  [/recorded.?message/i,                  'robocall'],
  [/auto.?dial/i,                         'robocall'],
  [/telemark/i,                           'telemarketer'],
  [/sales.?call/i,                        'telemarketer'],
  [/solicitation/i,                       'telemarketer'],
  [/scam/i,                               'scam'],
  [/fraud/i,                              'scam'],
  [/phish/i,                              'scam'],
  [/impersonat/i,                         'scam'],
  [/spoofing/i,                           'scam'],
  [/irs/i,                                'scam'],
  [/social.?security/i,                   'scam'],
  [/warrant/i,                            'scam'],
  [/lottery/i,                            'scam'],
  [/debt/i,                               'debt_collector'],
  [/collection/i,                         'debt_collector'],
  [/collector/i,                          'debt_collector'],
];

/**
 * Normalize a raw phone string to E.164 format (e.g. "+15551234567").
 * Supports international numbers from any country.
 * Returns null if the string cannot be parsed as a valid phone number.
 */
function normalizePhone(raw, defaultCountry) {
  if (!raw) return null;

  const str = String(raw).trim();

  try {
    // 1. If it already starts with '+', try parsing as international (no country hint)
    if (str.startsWith('+')) {
      if (isValidPhoneNumber(str)) {
        return parsePhoneNumber(str).format('E.164');
      }
    }

    // 2. Try with explicit default country if provided (e.g. 'GB', 'FR', 'IN')
    if (defaultCountry && isValidPhoneNumber(str, defaultCountry)) {
      return parsePhoneNumber(str, defaultCountry).format('E.164');
    }

    // 3. Try as US number (backward compatible for US-focused scrapers)
    if (isValidPhoneNumber(str, 'US')) {
      return parsePhoneNumber(str, 'US').format('E.164');
    }

    // 4. Try prepending '+' in case digits include country code but lack the plus
    const digits = str.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) {
      const withPlus = `+${digits}`;
      if (isValidPhoneNumber(withPlus)) {
        return parsePhoneNumber(withPlus).format('E.164');
      }
    }

    // 5. US fallback: bare 10-digit number → assume US
    if (digits.length === 10) {
      const usNumber = `+1${digits}`;
      if (isValidPhoneNumber(usNumber)) {
        return parsePhoneNumber(usNumber).format('E.164');
      }
    }
  } catch (_) {
    // fall through
  }

  return null;
}

/**
 * Normalize a raw spam score to the 0–10 scale.
 *
 * @param {number} rawScore - The score from the source
 * @param {number} sourceMax - The maximum value that source uses (e.g. 5 for a 5-star system)
 * @returns {number} Score in [0, 10]
 */
function normalizeScore(rawScore, sourceMax = 10) {
  if (rawScore == null || isNaN(rawScore)) return 0;
  return Math.min(10, Math.max(0, (rawScore / sourceMax) * 10));
}

/**
 * Derive a spam score from a raw report count using a logarithmic scale.
 * 1 report  → ~0
 * 10 reports → ~5
 * 100 reports → ~10
 */
function scoreFromCount(count) {
  if (!count || count <= 0) return 0;
  return Math.min(10, Math.log10(count + 1) * 5);
}

/**
 * Normalize a raw call type string to one of the canonical values.
 */
function normalizeCallType(raw) {
  if (!raw) return 'other';
  const s = String(raw).trim();
  if (CALL_TYPES.has(s)) return s;
  for (const [pattern, type] of CALL_TYPE_MAP) {
    if (pattern.test(s)) return type;
  }
  return 'other';
}

module.exports = { normalizePhone, normalizeScore, scoreFromCount, normalizeCallType };
