# SpamNumbers

An [OpenClaw](https://openclaw.ai) skill that automatically collects, stores, and queries spam phone number data from 12+ free public sources worldwide — no API keys required.

## What It Does

- Scans 12+ public spam caller databases (USA, UK, India, Australia, and more) and stores numbers locally in SQLite
- Supports worldwide phone numbers in E.164 format
- Deduplicates numbers automatically, merging data from multiple sources
- Runs weekly in the background via cron scheduler
- Exports to CSV for use in your own applications
- Works via any OpenClaw channel: Telegram, WhatsApp, Slack, Discord, etc.

## Data Sources (12+ total, all free & public)

**US Sources (8):**

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

**International Sources (4+):**

| Source | Region | Method |
|--------|--------|--------|
| [GitHub blocklists](https://github.com/topics/blocklist) | UK, India, Australia, EU | CSV/TXT files |
| OFCOM | UK | Public registry |
| TRAI | India | Public registry |
| ACMA | Australia | Public database |

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

### Quick Start (Automated)

```bash
# Clone or download the SpamNumbers repo, then run:
bash deploy.sh
```

This script will:
- Create the OpenClaw workspace directory if needed
- Copy the skill to the correct location
- Install all Node.js dependencies
- Run an initial data scrape to populate the database

### Manual Installation

If you prefer to install manually:

```bash
# Copy to OpenClaw workspace
cp -r /home/user/SpamNumbers ~/.openclaw/workspace/skills/spam-numbers

# Install Node.js dependencies
cd ~/.openclaw/workspace/skills/spam-numbers/scripts
npm install

# Populate database with first scrape
node index.js scrape
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

## Worldwide Support

Phone numbers are normalized to [E.164 format](https://en.wikipedia.org/wiki/E.164), supporting:
- 🇺🇸 USA: `+1XXXXXXXXXX`
- 🇬🇧 UK: `+44XXXXXXXXXX`
- 🇮🇳 India: `+91XXXXXXXXXX`
- 🇦🇺 Australia: `+61XXXXXXXXXX`
- And 190+ other countries

A single number can have reports from multiple countries, with metadata tracking which country reported each entry.

## Notes

- **Calls only** — no SMS numbers
- **Public data only** — all sources respect ToS and robots.txt
- If a source is blocked or unavailable, the scan continues with remaining sources
- Database stored at `scripts/data/spam_numbers.db` (SQLite)
- CSV exports saved to `scripts/exports/`
- Requires Node.js v18+ and npm
