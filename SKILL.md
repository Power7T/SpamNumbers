---
name: spam-numbers
description: "Scan public internet sources for spam caller databases, store numbers with metadata in a local SQLite database, and look up whether any phone number is flagged as spam. Covers US, UK, France/EU via local scrapers plus international lookup via SkipCalls API. Sources include FTC, 800notes, Should I Answer, YouMail, SkipCalls, WhoCallsMe, and verified GitHub community lists. No API keys required."
metadata:
  openclaw:
    emoji: "📵"
    always: true
    requires:
      bins: ["node", "npm"]
---

# Spam Numbers Skill

Maintain a local database of spam phone numbers collected from 10 free public sources (US, UK, France/EU). Numbers not in the local database are checked against the SkipCalls API for broader international coverage. Look up any number instantly, run scans on demand, export to CSV, or run fully automatically every week.

## When to USE This Skill

✅ Use this skill when the user:
- Asks if a phone number is spam / scam / robocall (e.g. "is 800-555-1234 spam?", "check +44 20 7946 0958")
- Wants to scan and update the spam database from all sources
- Wants to export the spam number list to a CSV file
- Wants to see statistics about the spam database
- Wants to start the automatic weekly update scheduler
- Asks about known scam or robocall numbers from any country

## When NOT to Use This Skill

❌ Do NOT use this skill for:
- SMS/text message spam (calls only)
- Real-time carrier data or live call blocking
- Services requiring payment or API keys

## Setup (first time)

Run once to install dependencies:

```bash
cd scripts && npm install
```

## Commands

### Look up a specific number

```bash
node scripts/index.js lookup <phone_number>
```

Supports any country's phone number format. Checks local DB first, then SkipCalls API as fallback.

Examples:
```bash
node scripts/index.js lookup 8005551234       # US
node scripts/index.js lookup +18005551234     # US (E.164)
node scripts/index.js lookup +442382280715    # UK
node scripts/index.js lookup +33178569561     # France
node scripts/index.js lookup +919876543210    # India
```

Output example:
```
📵 +18005551234 — SPAM CONFIRMED
  Score: 8.5/10 | Type: robocall | Reports: 1,247
  Sources: ftc, 800notes, youmail
  First seen: 2024-01-15 | Last updated: 2026-03-10
  Notes: IRS impersonation scam | Fake warranty calls
```

If not found locally but found via API:
```
📵 +919876543210 — SPAM (via SkipCalls API)
  Score: 7 | Type: telemarketer | Reports: 42
  Note: This number was not in the local database but was found via online lookup.
```

If not found:
```
✅ +18005551234 — Not found in spam database
```

### Run a full scan

```bash
node scripts/index.js scrape
```

Fetches fresh data from all 10 sources. Safe to run anytime — each source is isolated so one failure won't stop the rest.

### Export to CSV

```bash
node scripts/index.js export
# or with custom filename:
node scripts/index.js export my_spam_list.csv
```

Creates a CSV in `scripts/exports/` with columns: `phone_number, spam_score, call_type, country, report_count, sources, user_notes, date_first_seen, date_last_updated`

### Show database statistics

```bash
node scripts/index.js stats
```

Shows total numbers, per-source breakdown, top 10 highest-score numbers, and last scan time.

### Start weekly auto-scheduler

```bash
node scripts/index.js schedule
```

Runs a full scan immediately, then auto-repeats every Sunday at 2 AM. Keep this process running in the background.

## Data Sources (10 scrapers + 1 API, all free & public)

| Source | Region | Type |
|--------|--------|------|
| FTC DNC API | US | REST API |
| 800notes.com | US | HTML scraping |
| Should I Answer | US/International | HTML scraping |
| SpamCalls.net | US/International | HTML scraping |
| YouMail Robocall Index | US | HTML scraping |
| SkipCalls.net | International | HTML scraping |
| WhoCallsMe.com | US | HTML scraping |
| jwoertink/blocked-numbers | US | GitHub CSV |
| Oros42/phone-blacklist | France/EU | GitHub CSV |
| bretmlw/uk-phone-scam-numbers | UK | GitHub TXT |
| SkipCalls API (lookup fallback) | International | Free REST API |

## Notes

- Database is stored at `scripts/data/spam_numbers.db` (SQLite)
- If a source is blocked or down, the scan continues with remaining sources
- Duplicate numbers across sources are automatically merged (scores combined)
- Phone numbers are normalized to E.164 format for any country
- Country is auto-detected from phone number prefix
