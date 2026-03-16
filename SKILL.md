---
name: spam-numbers
description: "Scan public internet sources worldwide for spam caller databases, store numbers with metadata in a local SQLite database, and look up whether any phone number is flagged as spam across USA, UK, India, Australia, and more. Sources include FTC, 800notes, Should I Answer, YouMail, SkipCalls, WhoCallsMe, GitHub community lists, OFCOM, TRAI, and ACMA registries. No API keys required."
metadata:
  openclaw:
    emoji: "📵"
    always: true
    requires:
      bins: ["node", "npm"]
---

# Spam Numbers Skill

Maintain a local database of spam phone numbers collected from 12+ free public sources worldwide (USA, UK, India, Australia, and more). Look up any number instantly, run scans on demand, export to CSV, or run fully automatically every week.

## When to USE This Skill

✅ Use this skill when the user:
- Asks if a phone number is spam / scam / robocall (e.g. "is 800-555-1234 spam?", "check this number for me")
- Wants to scan and update the spam database from all sources
- Wants to export the spam number list to a CSV file
- Wants to see statistics about the spam database
- Wants to start the automatic weekly update scheduler
- Asks about known scam or robocall numbers

## When NOT to Use This Skill

❌ Do NOT use this skill for:
- SMS/text message spam (calls only)
- Real-time carrier data or live call blocking
- Services requiring payment or API keys
- Non-US numbers (primarily US database)

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

Examples:
```bash
# US numbers
node scripts/index.js lookup 8005551234
node scripts/index.js lookup +18005551234
node scripts/index.js lookup "800-555-1234"

# International numbers
node scripts/index.js lookup +441632960000    # UK
node scripts/index.js lookup +919876543210    # India
node scripts/index.js lookup +61212345678     # Australia
```

Output example:
```
📵 +18005551234 — SPAM CONFIRMED
  Score: 8.5/10 | Type: robocall | Reports: 1,247
  Sources: ftc, 800notes, youmail
  First seen: 2024-01-15 | Last updated: 2026-03-10
  Notes: IRS impersonation scam | Fake warranty calls
```

If not found:
```
✅ +18005551234 — Not in spam database
```

### Run a full scan (all 8 sources)

```bash
node scripts/index.js scrape
```

Fetches fresh data from all sources. Safe to run anytime — each source is isolated so one failure won't stop the rest.

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

## Data Sources (12+ total, all free & public)

**US Sources (8):**

| Source | Type | Notes |
|--------|------|-------|
| FTC DNC API | REST API | Official US govt complaint data |
| 800notes.com | HTML scraping | Crowdsourced user reports |
| Should I Answer | HTML scraping | Rated phone number database |
| SpamCalls.net | HTML scraping | Handles Cloudflare gracefully |
| YouMail Robocall Index | HTML scraping | Monthly top robocallers |
| SkipCalls.net | HTML scraping | 1M+ spam numbers, no auth |
| WhoCallsMe.com | HTML scraping | US crowdsourced reports |
| GitHub Lists (US) | Direct download | Community-maintained blocklists |

**International Sources (4+):**

| Source | Region | Type | Notes |
|--------|--------|------|-------|
| GitHub Lists (International) | UK, India, Australia, EU | CSV/TXT | Global community blocklists |
| OFCOM | UK | Public registry | Official UK telecom regulator |
| TRAI | India | Public registry | Indian telecom regulatory authority |
| ACMA | Australia | Public database | Australian communications regulator |

## Notes

- Database is stored at `scripts/data/spam_numbers.db` (SQLite)
- If a source is blocked or down, the scan continues with remaining sources
- Duplicate numbers across sources are automatically merged (scores combined)
- Phone numbers are normalized to E.164 format (+1XXXXXXXXXX for US)
