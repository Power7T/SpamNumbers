'use strict';

/**
 * FTC Do Not Call - Reported Calls Data
 * Public REST API, no authentication required.
 * https://api.ftc.gov/v0/dnc-complaints
 *
 * Fetches complaints from the last 7 days to keep each weekly run bounded.
 */

const { fetchWithHeaders, sleep } = require('./base');
const { normalizePhone, normalizeCallType } = require('../normalizer');

const API_BASE = 'https://api.ftc.gov/v0/dnc-complaints';
const SOURCE = 'ftc';
const PAGE_SIZE = 500;
const PAGE_DELAY_MS = 1000;

// FTC "issue" field to canonical call type mapping
const FTC_ISSUE_MAP = {
  'Robocalls': 'robocall',
  'Recorded Message or Robocall': 'robocall',
  'Telemarketing (including do not call and spoofing)': 'telemarketer',
  'Telemarketing': 'telemarketer',
  'Debt Collection': 'debt_collector',
  'Debt Collector': 'debt_collector',
  'Spoofing': 'scam',
  'Imposters': 'scam',
  'Imposter: Government': 'scam',
  'Imposter: Business': 'scam',
  'Imposter: Tech Support': 'scam',
  'Warrant': 'scam',
};

function ftcCallType(issue) {
  if (!issue) return 'other';
  const direct = FTC_ISSUE_MAP[issue];
  if (direct) return direct;
  return normalizeCallType(issue);
}

/**
 * Returns a YYYY-MM-DD string for N days ago.
 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function scrapeFtc() {
  const records = [];
  let offset = 0;
  let page = 0;
  const startDate = daysAgo(7);

  console.log(`[ftc] Fetching complaints since ${startDate}`);

  while (true) {
    const url =
      `${API_BASE}?items_per_page=${PAGE_SIZE}&offset=${offset}` +
      `&violation_date_begin=${startDate}`;

    let res, data;
    try {
      res = await fetchWithHeaders(url, {
        headers: { 'Accept': 'application/json' },
        timeout: 20000,
      });
      if (!res.ok) {
        console.warn(`[ftc] HTTP ${res.status} on page ${page}, stopping pagination`);
        break;
      }
      data = await res.json();
    } catch (err) {
      console.warn(`[ftc] Request failed on page ${page}: ${err.message}`);
      break;
    }

    const items = data?.data || [];
    if (items.length === 0) break;

    for (const item of items) {
      const attrs = item.attributes || {};
      const rawPhone = attrs['phone-number'] || attrs['company-phone-number'];
      const phone = normalizePhone(rawPhone);
      if (!phone) continue;

      const issue = attrs['issue'] || '';
      const isRobocall = attrs['recorded-message-or-robocall'] === 'Y' || attrs['recorded-message-or-robocall'] === true;
      const callType = isRobocall ? 'robocall' : ftcCallType(issue);

      const notes = [
        attrs['company-name'] ? `Company: ${attrs['company-name']}` : '',
        attrs['subject'] ? `Subject: ${attrs['subject']}` : '',
        issue ? `Issue: ${issue}` : '',
      ].filter(Boolean).join('; ');

      records.push({
        phone_number: phone,
        source: SOURCE,
        spam_score: isRobocall ? 8 : 6,
        call_type: callType,
        country: 'US',
        report_count: 1,
        user_notes: notes,
        date_first_seen: attrs['created-date'] || new Date().toISOString(),
        raw_data: JSON.stringify({ issue, isRobocall }),
      });
    }

    console.log(`[ftc] Page ${page}: ${items.length} items (total so far: ${records.length})`);

    if (items.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
    page++;
    await sleep(PAGE_DELAY_MS);
  }

  console.log(`[ftc] Done — ${records.length} records`);
  return records;
}

module.exports = { scrapeFtc };
