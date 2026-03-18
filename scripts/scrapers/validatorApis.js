'use strict';

/**
 * Validator APIs Scraper (NumVerify & AbstractAPI)
 * Validates top entries in the database using external APIs to confirm they are indeed spammers.
 * Since these APIs have low limits, we only check the topmost "Unknown" or "Potential" records.
 */

const { fetchText } = require('./base');
const { normalizePhone } = require('../normalizer');

const SOURCE = 'validator_apis';

async function scrapeValidators(db) {
  const numverifyKey = process.env.NUMVERIFY_API_KEY || '';
  const abstractKey = process.env.ABSTRACT_API_KEY || '';

  if (!numverifyKey && !abstractKey) {
    console.log('[validator_apis] No API keys found (NUMVERIFY_API_KEY or ABSTRACT_API_KEY), skipping');
    return [];
  }

  // Get top 25 numbers by reports but with low confidence/unknown country
  const potentialSpammers = db.prepare(`
    SELECT phone_number FROM spam_numbers 
    WHERE confidence = 'low' 
    ORDER BY report_count DESC LIMIT 25
  `).all();

  if (potentialSpammers.length === 0) return [];

  console.log(`[validator_apis] Validating ${potentialSpammers.length} potential spammers...`);

  const records = [];

  for (const { phone_number } of potentialSpammers) {
    let spamStatus = null;
    let details = '';

    // Try NumVerify (Free tier: 100 lookups/month)
    if (numverifyKey) {
      try {
        const url = `http://apilayer.net/api/validate?access_key=${numverifyKey}&number=${phone_number.replace('+', '')}`;
        const res = await fetchText(url, { timeout: 5000 });
        const data = JSON.parse(res);
        if (data.valid === false) {
          spamStatus = 'invalid_number';
          details = 'NumVerify: number is invalid/unallocated';
        } else {
          // Some NumVerify attributes like 'carrier' can hint at VoIP
          details = `NumVerify: ${data.carrier || 'Unknown'} | Line: ${data.line_type || 'Unknown'}`;
        }
      } catch (_) {}
    }

    // Try AbstractAPI (Free tier: 250 requests/month)
    if (abstractKey && !spamStatus) {
      try {
        const url = `https://phonevalidation.abstractapi.com/v1/?api_key=${abstractKey}&phone=${phone_number.replace('+', '')}`;
        const res = await fetchText(url, { timeout: 5000 });
        const data = JSON.parse(res);
        if (data.valid === true) {
          details += ` | Abstract: ${data.carrier || 'Unknown'} | Type: ${data.line_type || 'Unknown'}`;
          // Abstract often provides 'fraud' or 'spam' score in premium, 
          // but for free tier let's assume valid and suspicious is enough to update details.
        }
      } catch (_) {}
    }

    if (details) {
      records.push({
        phone_number,
        source: SOURCE,
        spam_score: 5, // Neutral score change, just providing info
        call_type: 'bulk', // Most suspicious numbers from these APIs are automated/VoIP
        country: 'Global',
        report_count: 0,
        user_notes: details,
        date_first_seen: new Date().toISOString(),
        raw_data: JSON.stringify({ validated: true }),
      });
    }
  }

  console.log(`[validator_apis] Done — ${records.length} records updated with API info`);
  return records;
}

module.exports = { scrapeValidators };
