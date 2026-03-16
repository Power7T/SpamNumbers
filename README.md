# SpamNumbers

An [OpenClaw](https://openclaw.ai) skill that collects, stores, and queries spam phone number data from 10 free public sources — no API keys required. Covers US, UK, France/EU with online API fallback for international lookups.

## What It Does

- Scans 10 public spam caller databases and stores numbers locally in SQLite
- Supports worldwide phone numbers in E.164 format (190+ countries)
- Falls back to SkipCalls API for numbers not in the local database
- Deduplicates numbers automatically, merging data from multiple sources
- Runs weekly in the background via cron scheduler
- Exports to CSV for use in your own applications
- Works via any OpenClaw channel: Telegram, WhatsApp, Slack, Discord, etc.

## Data Sources (all free, public data only)

**Bulk Scrapers (local database):**

| Source | Region | Method |
|--------|--------|--------|
| [FTC Do Not Call Registry](https://api.ftc.gov/v0/dnc-complaints) | US | Public REST API |
| [800notes.com](https://800notes.com) | US | HTML scraping |
| [Should I Answer](https://www.shouldianswer.com) | US/International | HTML scraping |
| [SpamCalls.net](https://www.spamcalls.net) | US/International | HTML scraping |
| [YouMail Robocall Index](https://robocallindex.com) | US | HTML scraping |
| [SkipCalls.net](https://skipcalls.com) | International | HTML scraping |
| [WhoCallsMe.com](https://www.whocallsme.com) | US | HTML scraping |
| [jwoertink/blocked-numbers](https://github.com/jwoertink/blocked-numbers) | US | GitHub CSV |
| [Oros42/phone-blacklist](https://github.com/Oros42/phone-blacklist) | France/EU | GitHub CSV |
| [bretmlw/uk-phone-scam-numbers](https://github.com/bretmlw/uk-phone-scam-numbers) | UK | GitHub TXT |

**Online Lookup Fallback:**

| Source | Region | Method |
|--------|--------|--------|
| [SkipCalls API](https://skipcalls.com) | International (1M+ numbers) | Free REST API |

When looking up a number, the tool first checks the local database. If not found, it queries the SkipCalls API for broader international coverage.

## Data Collected Per Number

- Phone number (normalized to E.164)
- Spam score (0–10)
- Call type (robocall / telemarketer / scam / debt_collector / other)
- Country (detected from phone prefix or source metadata)
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

# Check if a number is spam (any country)
node index.js lookup 8005551234           # US
node index.js lookup +442382280715        # UK
node index.js lookup +33178569561         # France
node index.js lookup +919876543210        # India

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
- *"Check +44 20 7946 0958 for me"*
- *"Is +33178569561 a scam number?"*
- *"Run a spam scan now"*
- *"Export my spam list to CSV"*
- *"Show spam database stats"*

## Coverage

| Region | Local DB | Online Fallback |
|--------|----------|-----------------|
| US | Strong (8 scrapers) | Yes |
| UK | Good (GitHub blocklist) | Yes |
| France/EU | Good (GitHub blocklist) | Yes |
| Other countries | Via phone format only | Yes (SkipCalls API) |

**Phone normalization** supports all 190+ countries (E.164 format). The local database has the strongest coverage for US/UK/EU. For other countries, the SkipCalls API provides broader but less comprehensive coverage.

## Notes

- **Calls only** — no SMS numbers
- **Public data only** — all sources are free and respect ToS
- If a source is blocked or unavailable, the scan continues with remaining sources
- Database stored at `scripts/data/spam_numbers.db` (SQLite)
- CSV exports saved to `scripts/exports/`
- Requires Node.js v18+ and npm
