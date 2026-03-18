'use strict';

/**
 * FTC DNC Complaints API Scraper
 * Uses api.data.gov to fetch recent complaints.
 */

const { fetchText } = require('./base');
const { normalizePhone, normalizeCallType } = require('../normalizer');

const SOURCE = 'ftc_api';

/**
 * Returns a YYYY-MM-DD string for today.
 */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function scrapeFtcApi() {
  const apiKey = process.env.FTC_API_KEY || '';
  if (!apiKey || apiKey === 'DEMO_KEY') {
    return [];
  }

  const date = todayStr();
  const records = [];

  try {
    // API Documentation: https://api.ftc.gov/v0/dnc-complaints
    // We'll fetch today's complaints.
    const url = `https://api.ftc.gov/v0/dnc-complaints?api_key=${apiKey}&created_date="${date}"&items_per_page=50&sort_order=DESC`;
    
    console.log(`[ftc_api] Calling FTC API for ${date}...`);
    const res = await fetchText(url, { timeout: 10000 });
    const json = JSON.parse(res);

    if (!json || !json.data) {
      console.warn('[ftc_api] No data returned from API');
      return [];
    }

    for (const item of json.data) {
      const attr = item.attributes || {};
      const rawPhone = attr['company-phone-number'];
      const phone = normalizePhone(rawPhone);
      if (!phone) continue;

      const subject = attr['subject'] || '';
      const isRobo = attr['recorded-message-or-robocall'];
      const state = attr['consumer-state'] || '';
      const city = attr['consumer-city'] || '';

      records.push({
        phone_number: phone,
        source: SOURCE,
        spam_score: 9, // API data is highly reliable (direct reports)
        call_type: isRobo === 'Y' ? 'robocall' : normalizeCallType(subject) || 'spam',
        country: 'US',
        report_count: 1,
        user_notes: `${subject} | Location: ${city}, ${state}`,
        date_first_seen: attr['created-date'] || new Date().toISOString(),
        raw_data: JSON.stringify({ id: item.id }),
      });
    }
  } catch (err) {
    console.warn(`[ftc_api] API Error: ${err.message}`);
  }

  console.log(`[ftc_api] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeFtcApi };
