---
name: spam-numbers
slug: spam-numbers
version: 1.0.0
description: "Look up any phone number against 10 free spam databases and return a spam score with source attribution."
metadata:
  openclaw:
    emoji: "📵"
    always: true
    os: [linux, darwin, win32]
    requires:
      bins: ["node", "npm"]
---

# Spam Numbers

## When to Use

- User asks if a phone number is spam, scam, or robocall
- User wants to scan/update the spam database
- User wants to export spam numbers or view stats

## When NOT to Use

- SMS/text spam (calls only)
- Real-time carrier data or live call blocking

## Setup

Run once: `cd scripts && npm install`

## Commands

| Action | Command |
|--------|---------|
| Lookup | `node scripts/index.js lookup <number>` |
| Scan all sources | `node scripts/index.js scrape` |
| Export CSV | `node scripts/index.js export [filename]` |
| Stats | `node scripts/index.js stats` |
| Bulk lookup | `node scripts/index.js bulk <file>` |
| Whitelist | `node scripts/index.js whitelist <number>` |
| Auto-schedule | `node scripts/index.js schedule` |

Numbers are normalized to E.164 — any country format accepted (US, UK, FR, IN, AU, etc.).
Local DB checked first; SkipCalls API used as international fallback.

## Quick Reference

| Topic | File |
|-------|------|
| Full command docs & output examples | `usage.md` |
| Data sources & coverage | `sources.md` |

## Core Rules

1. Always run `lookup` before telling the user a number is safe
2. Present score as X/10 with confidence level and sources
3. If local DB misses, mention the API fallback result separately
4. Never claim a number is safe — say "not found in spam database"
