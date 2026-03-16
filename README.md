# SpamNumbers

An [OpenClaw](https://openclaw.ai) skill that automatically collects, stores, and queries spam phone number data from 8 free public sources — no API keys required.

## What It Does

- Scans 8 public spam caller databases and stores numbers locally in SQLite
- Deduplicates numbers automatically, merging data from multiple sources
- Runs weekly in the background via cron scheduler
- Exports to CSV for use in your own applications
- Works via any OpenClaw channel: Telegram, WhatsApp, Slack, Discord, etc.

## Data Sources (8 total, all free)

| Source | Method |
|--------|--------|
| [FTC Do Not Call Registry](https://api.ftc.gov/v0/dnc-complaints) | Public REST API |
| [800notes.com](https://800notes.com) | HTML scraping |
| [Should I Answer](https://www.shouldianswer.com) | HTML scraping |
| [SpamCalls.net](https://www.spamcalls.net) | HTML scraping |
| [YouMail Robocall Index](https://robocallindex.com) | HTML scraping |
| [SkipCalls.net](https://skipcalls.com) | HTML scraping |
| [WhoCallsMe.com](https://www.whocallsme.com) | HTML scraping |
| GitHub community blocklists | Direct file download |

## Data Collected Per Number

- Phone number (normalized to E.164)
- Spam score (0–10)
- Call type (robocall / telemarketer / scam / debt_collector / other)
- Country
- Source(s)
- Report count
- User notes and comments
- Date first seen / last updated

## Installation

```bash
# Install as an OpenClaw workspace skill
cp -r spam-numbers ~/.openclaw/workspace/skills/

# Install Node.js dependencies (one-time)
cd ~/.openclaw/workspace/skills/spam-numbers/scripts
npm install
```

## CLI Usage

```bash
cd scripts

# Run all scrapers now
node index.js scrape

# Check if a number is spam
node index.js lookup 8005551234
node index.js lookup "+1 (800) 555-1234"

# Export to CSV
node index.js export
node index.js export my_list.csv

# Show database statistics
node index.js stats

# Start weekly auto-scheduler (runs immediately + every Sunday 2 AM)
node index.js schedule
```

## Chat Usage (via OpenClaw)

Once installed, just message your bot on any channel:

- *"Is 800-555-1234 spam?"*
- *"Check this number for me: +1 (555) 867-5309"*
- *"Run a spam scan now"*
- *"Export my spam list to CSV"*
- *"Show spam database stats"*
- *"Start the weekly spam updater"*

## CSV Export Columns

```
phone_number, spam_score, call_type, country, report_count, sources, user_notes, date_first_seen, date_last_updated
```

## Notes

- Calls only — no SMS numbers
- If a source is blocked or unavailable, the scan continues with remaining sources
- Database stored at `scripts/data/spam_numbers.db` (SQLite)
- CSV exports saved to `scripts/exports/`
