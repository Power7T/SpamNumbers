---
name: spam-numbers
description: "Maintain and query a local SQLite database of spam/scam phone numbers scraped from 14 public sources (FTC, 800notes, Nomorobo, GitHub lists, etc). Commands: 'scrape' (update database from all sources), 'stats' (show total counts), 'export' (CSV export), 'lookup <number>' (check if spam), 'schedule' (weekly auto-update). The word 'scrape' alone means run the spam-numbers scraper. No API keys required."
metadata:
  openclaw:
    emoji: "📵"
    always: true
    os: [linux, darwin, win32]
    requires:
      bins: ["node", "npm"]
---

# Spam Numbers Skill

Maintain a local database of spam phone numbers collected from 14 free public sources (US, UK, France/EU, Global). Numbers not in the local database are checked against the SkipCalls API for broader international coverage. Look up any number instantly, run scans on demand, export to CSV, or run fully automatically every week.

## When to Use

Use this skill when the user:
- Says **"scrape"** or **"scan"** alone — this means run the spam-numbers scraper immediately
- Says **"stats"** or **"total numbers"** — show DB statistics
- Says **"export"** — export DB to CSV
- Asks if a phone number is spam, scam, or robocall (e.g. "is 800-555-1234 spam?", "check +44 20 7946 0958")
- Wants to scan and update the spam database from all sources
- Wants to export the spam number list to a CSV file
- Wants to see statistics about the spam database
- Wants to start the automatic weekly update scheduler
- Asks about known scam or robocall numbers from any country

## When NOT to Use

- SMS/text message spam (calls only)
- Real-time carrier data or live call blocking
- Services requiring payment or API keys

**User Query Handling Rules:**
- DO NOT EXPLAIN OR CHAT UNLESS REQUIRED. Just execute the exact script and output the result.
- If the user sends the single word "spam", do not run any scripts. Instead, immediately reply with a numbered list of all the things you can do (e.g., "I am the Spam Numbers agent. Here is what I can do for you: \n 1. Scan and add new spam numbers \n 2. Show a high-level spam database report \n 3. Check the live status of a running task \n 4. Export the database to CSV \n 5. Look up a specific number \n 6. Schedule daily or weekly automatic updates"). 
- Do not make up non-existent flags. Only use the commands mapped in the table.

## Agent Quick Commands

> These are the exact shell commands to run for each user shorthand. Always use the skill directory as the working directory.

| User says | Run this command |
|-----------|------------------|
| `scrape` | `node /root/.openclaw/workspace/skills/spam-numbers/scripts/index.js scrape` |
| `stats` | `node /root/.openclaw/workspace/skills/spam-numbers/scripts/index.js stats` |
| `export` | `node /root/.openclaw/workspace/skills/spam-numbers/scripts/index.js export` |
| `schedule daily` | `node /root/.openclaw/workspace/skills/spam-numbers/scripts/index.js schedule daily` |
| `schedule weekly` | `node /root/.openclaw/workspace/skills/spam-numbers/scripts/index.js schedule weekly` |
| `status` | `node /root/.openclaw/workspace/skills/spam-numbers/scripts/index.js status` |
| `lookup <number>` | `node /root/.openclaw/workspace/skills/spam-numbers/scripts/index.js lookup <number>` |

**CEO-Level Commands:**
If the user asks for a high-level summary of the spam database, use the `stats` command.
Example: `@bot give me the spam database report` or `@bot summarize spam numbers for today` -> Run `stats` and summarize: *"I scanned 14 sources today. Found X new spam numbers... Primary scam recognized: Y..."*
Example: `@bot analyze spam risk for <number>` -> Run `lookup <number>` and give a professional risk assessment (e.g. *"🚨 HIGH CONFIDENCE SPAM..."*).


**Live Progress Tracking:**
- When a scrape is running, if the user asks "how is it going?" or "any updates?", run the `status` command above to read the current progress log.
- Do not wait for the main scrape to finish to report progress; you can run the `status` command independently.

**Important:** When the user says just `scrape`, `scan`, or `scan for scam numbers`, immediately run the scrape command above. Do not ask for clarification.


## Setup (first time)

Run once to install dependencies:

```bash
cd /root/.openclaw/workspace/skills/spam-numbers/scripts && npm install
```

## Commands

### Look up a specific number

```bash
node index.js lookup <phone_number>
```

Supports any country's phone number format. Checks local DB first, then SkipCalls API as fallback.

Examples:
```bash
node index.js lookup 8005551234       # US
node index.js lookup +18005551234     # US (E.164)
node index.js lookup +442382280715    # UK
node index.js lookup +33178569561     # France
node index.js lookup +919876543210    # India
```

Output example:
```
📵 +18005551234 — SPAM CONFIRMED
  Score: 8.5/10 | Confidence: high | Type: robocall | Reports: 1,247
  Sources: ftc, 800notes, youmail
  First seen: 2024-01-15 | Last updated: 2026-03-10
  Notes: IRS impersonation scam | Fake warranty calls
```

If not found locally but found via API:
```
📵 +919876543210 — SPAM (via SkipCalls API)
  Score: 7/10 | Type: telemarketer | Reports: 42
  Note: Not in local database — found via online lookup.
```

If not found:
```
✅ +18005551234 — Not found in spam database
```

### Bulk lookup

```bash
node index.js bulk numbers.txt
```

Check multiple numbers from a text file (one per line).

### Run a full scan

```bash
node index.js scrape
```

Fetches fresh data from all 14 sources. Safe to run anytime — each source is isolated so one failure won't stop the rest.

### Export to CSV

```bash
node index.js export
node index.js export my_spam_list.csv
```

Creates a CSV in `scripts/exports/` with columns: `phone_number, spam_score, call_type, country, report_count, sources, user_notes, date_first_seen, date_last_updated`

### Show database statistics

```bash
node index.js stats
```

Shows total numbers, per-source breakdown, top 10 highest-score numbers, and last scan time.

### Whitelist / unwhitelist

```bash
node index.js whitelist +18005551234
node index.js unwhitelist +18005551234
```

Marks false positives so they are excluded from future lookup results.

### Start weekly auto-scheduler

```bash
node index.js schedule
```

Runs a full scan immediately, then auto-repeats every Sunday at 2 AM. Keep this process running in the background.

## Data Sources (14 scrapers + 1 API, all free & public)

| Source | Region | Type | Weight |
|--------|--------|------|--------|
| FTC DNC API | US | REST API | 1.0 (highest trust) |
| 800notes.com | US | HTML scraping | 0.7 |
| Should I Answer | US/International | HTML scraping | 0.7 |
| YouMail Robocall Index | US | HTML scraping | 0.6 |
| SkipCalls.net | International | HTML scraping | 0.6 |
| WhoCallsMe.com | US | HTML scraping | 0.6 |
| CallerCenter.com | US | HTML scraping | 0.6 |
| SpamCalls.net | US/International | HTML scraping | 0.5 |
| Nomorobo Top Robocallers | US | HTML scraping | 0.5 |
| jwoertink/blocked-numbers | US | GitHub CSV | 0.4 |
| Oros42/phone-blacklist | France/EU | GitHub CSV | 0.4 |
| bretmlw/uk-phone-scam-numbers | UK | GitHub TXT | 0.4 |
| greyhat-academy/lists.d | Global | GitHub TSV | 0.4 |
| Swyter/call-spam-blocklist | Global | GitHub CSV | 0.4 |
| sundowndev/phone-number-based-spam-list | Global | GitHub CSV | 0.4 |
| SkipCalls API (lookup fallback) | International | Free REST API | — |

## Core Rules

1. Always run `lookup` before telling the user a number is safe
2. Present score as X/10 with confidence level and sources listed
3. If local DB misses, mention the API fallback result separately
4. Never claim a number is safe — say "not found in spam database"
5. Phone numbers accepted in any format — normalized to E.164 internally

## Notes

- Database stored at `scripts/data/spam_numbers.db` (SQLite)
- Phone normalization via `libphonenumber-js` — 190+ countries supported
- Duplicate numbers across sources are merged (scores weighted and combined)
- Confidence: low (1 source), medium (2 sources), high (3+ sources)
- Scores decay for numbers not updated in 90+ days (run `node scripts/index.js decay`)
- If a source is blocked or down, the scan continues with remaining sources

## Quick Reference

| Topic | File |
|-------|------|
| Full command docs & output examples | `usage.md` |
| Data sources, weights & coverage detail | `sources.md` |
