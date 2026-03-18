'use strict';

const libphonenumber = require('google-libphonenumber');
const phoneUtil = libphonenumber.PhoneNumberUtil.getInstance();
const PNF = libphonenumber.PhoneNumberFormat;


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
 * Uses google-libphonenumber for accurate carrier-level deduplication worldwide.
 */
function normalizePhone(raw, defaultCountry = 'US') {
  if (!raw) return null;

  try {
    let str = String(raw).trim();
    
    // Quick heuristic: if it's 10 digits and defaultCountry is US, auto-adjust before parse
    const digitsOnly = str.replace(/\D/g, '');
    if (digitsOnly.length === 10 && !str.startsWith('+') && (defaultCountry === 'US' || !defaultCountry)) {
      str = '+1' + digitsOnly;
    } else if (digitsOnly.length > 10 && !str.startsWith('+')) {
      str = '+' + digitsOnly;
    }

    const number = phoneUtil.parseAndKeepRawInput(str, defaultCountry);
    if (phoneUtil.isValidNumber(number)) {
      return phoneUtil.format(number, PNF.E164);
    }
  } catch (_) {
    // If exact parsing fails, we could try extracting from string, but strict lookup is safer
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
