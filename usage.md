# Usage — Spam Numbers Skill

## Lookup a Number

```bash
node scripts/index.js lookup <phone_number>
```

Accepts any format — US 10-digit, E.164, or local with country prefix:

```bash
node scripts/index.js lookup 8005551234       # US
node scripts/index.js lookup +18005551234     # US (E.164)
node scripts/index.js lookup +442382280715    # UK
node scripts/index.js lookup +33178569561     # France
node scripts/index.js lookup +919876543210    # India
```

### Output Examples

**Spam confirmed (local DB):**
```
📵 +18005551234 — SPAM CONFIRMED
  Score: 8.5/10 | Confidence: high | Type: robocall | Reports: 1,247
  Sources: ftc, 800notes, youmail
  First seen: 2024-01-15 | Last updated: 2026-03-10
  Notes: IRS impersonation scam | Fake warranty calls
```

**Found via API fallback:**
```
📵 +919876543210 — SPAM (via SkipCalls API)
  Score: 7/10 | Type: telemarketer | Reports: 42
  Note: Not in local database — found via online lookup.
```

**Not found:**
```
✅ +18005551234 — Not found in spam database
```

## Bulk Lookup

Check multiple numbers from a text file (one per line):

```bash
node scripts/index.js bulk numbers.txt
```

## Scan All Sources

```bash
node scripts/index.js scrape
```

Fetches fresh data from all 10 sources in parallel groups. Each source is isolated — one failure won't stop the rest. Safe to run anytime.

## Export to CSV

```bash
node scripts/index.js export
node scripts/index.js export my_spam_list.csv
```

Creates a CSV in `scripts/exports/` with columns: `phone_number, spam_score, call_type, country, report_count, sources, user_notes, date_first_seen, date_last_updated`.

## Database Statistics

```bash
node scripts/index.js stats
```

Shows total numbers, per-source breakdown, top 10 highest-score numbers, and last scan time.

## Whitelist / Unwhitelist

Mark a false positive:

```bash
node scripts/index.js whitelist +18005551234
node scripts/index.js unwhitelist +18005551234
```

Whitelisted numbers are excluded from lookup results.

## Stale Data Decay

```bash
node scripts/index.js decay
```

Reduces scores of numbers not updated in 90+ days. Runs automatically during scheduled scans.

## Weekly Auto-Scheduler

```bash
node scripts/index.js schedule
```

Runs a full scan immediately, then repeats every Sunday at 2 AM. Keep this process running (use `nohup`, `screen`, or a process manager).

## Chat Examples

Once deployed, users can message the bot on any OpenClaw channel:

- *"Is 800-555-1234 spam?"*
- *"Check +44 20 7946 0958 for me"*
- *"Run a spam scan now"*
- *"Export my spam list"*
- *"Show spam database stats"*

## Technical Notes

- Database: `scripts/data/spam_numbers.db` (SQLite)
- Phone normalization: E.164 format, 190+ countries via `libphonenumber-js`
- Scoring: Weighted by source reliability (government > community > scraped)
- Confidence: low (1 source), medium (2 sources), high (3+ sources)
