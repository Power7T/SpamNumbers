# 🛡️ SpamNumbers | Enterprise-Grade Global Threat Intelligence

[![OpenClaw Skill](https://img.shields.io/badge/OpenClaw-Skill-blue.svg)](https://openclaw.ai)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0-brightgreen.svg)](https://nodejs.org)
[![SQLite3](https://img.shields.io/badge/Database-SQLite3-lightgrey.svg)](https://sqlite.org)

**SpamNumbers** is a highly advanced, fully automated Open Source Intelligence (OSINT) engine built as an **[OpenClaw AI Skill](https://openclaw.ai)**. It autonomously tracks, aggregates, and scores global telemarketing, scam, and robocall threats in real time without requiring any paid API keys.

---

## 🌟 Elite Capabilities

1. **Global Stealth Crawling**
   - Employs headless `puppeteer` engines injected with Cloudflare-bypassing stealth plugins.
   - Dynamically scrapes live community-reported scam directories from over **40 global regions** (US, UK, LatAm, Africa, India, and APAC).
2. **Dynamic FTC Registry Ingestion**
   - Automatically crawls the Federal Trade Commission's public indices for newly released Do Not Call (DNC) violation records, self-healing data gaps dynamically.
3. **High-Speed Database Architecture**
   - Powered by `better-sqlite3` and wrapped in heavily optimized bulk transaction endpoints.
   - Capable of ingesting, deduplicating, and calculating confidence scores for **100,000+ threat records in under 2 seconds**.
4. **Strict E.164 Identity Resolution**
   - Uses native Google carrier-grade libraries (`google-libphonenumber`) to rigorously format any international number, perfectly preventing database pollution and regional format ghosting.
5. **CEO-Level TUI Agent Integration**
   - Plug-and-play mapped to OpenClaw’s Terminal User Interface (TUI). Fully programmable to generate executive-level "Threat Reports" or live risk assessments directly through conversational AI.

---

## 📡 Live Intelligence Matrix

SpamNumbers aggregates intelligence silently from a diverse array of global honeypots:

| **Vector** | **Coverage** | **Ingestion Method** |
|------------|-------------|----------------------|
| **FTC Complaints** | United States | Dynamic HTML Document Spiders |
| **Github OSINT** | US, UK, EU | Raw Git Repository Scraping |
| **SpamCalls.net** | Global | Stealth Web Crawling |
| **Tellows Global** | LatAm, Asia, Africa, EU | Regional Domain Shifting Crawler|
| **SkipCalls** | International / Fallback | Open REST API |

---

## 🚀 Installation & Deployment

### 1. Clone & Link to OpenClaw
```bash
git clone https://github.com/Power7T/SpamNumbers.git
cp -r SpamNumbers ~/.openclaw/workspace/skills/spam-numbers
cd ~/.openclaw/workspace/skills/spam-numbers
```

### 2. Install Engine Dependencies
```bash
npm install
```
*(Note: Because this stack leverages `better-sqlite3` and `puppeteer`, ensure `python3` and `make` are available on your system, and that your VPS has Chromium natively installed).*

### 3. Initialize the Global Crawler
Force the master orchestrator to run its first massive planetary crawl to seed your SQLite database:
```bash
node scripts/index.js scrape
```

---

## 💻 Technical Usage (CLI)

The underlying engine can be operated manually for administrative management:

```bash
# Force an immediate planet-wide threat intelligence sweep
node scripts/index.js scrape

# Analyze a specific target number's threat level
node scripts/index.js lookup +18005551234
node scripts/index.js lookup +919876543210

# Generate a high-level statistical breakdown of the local database
node scripts/index.js stats

# Dump the entire relational intelligence database to a flat CSV
node scripts/index.js export /var/backups/threat_intel.csv

# Launch the continuous background surveillance daemon (Daily/Weekly)
node scripts/index.js schedule daily
node scripts/index.js schedule weekly
```

---

## 🤖 Conversational AI Usage

Because SpamNumbers is an **OpenClaw Skill**, simply chat with your OpenClaw agent naturally on Telegram, WhatsApp, Slack, or the TUI. 

Use the trigger word `spam` to pull up the interactive console:
> *"I am the Spam Numbers agent. Here is what I can do for you:*
  1. **Scan and add new spam numbers** (`scrape`)
  2. **Show a high-level spam database report** (`stats`)
  3. **Check the live status of a running task** (`status`)
  4. **Export the database to CSV** (`export`) — *Automatically downloads to your PC / Downloads folder*
  5. **Look up a specific number** (`lookup`)
  6. **Schedule daily or weekly automatic updates** (`schedule`)
  7. **Autonomous OSINT Hunter** (`hunt`) - Finds numbers from Reddit/forums
  8. **Bulk lookup from a text file** (`bulk`)
  9. **Whitelist or unwhitelist a number** (`whitelist`/`unwhitelist`)
  10. **Manually add a confirmed scam number** (`add`)
  11. **Recover historical records** (`deep-crawl`)
  12. **Clean up stale/old data** (`decay`)
  13. **Configure API keys** (`config`)

Or request complex analytical workflows naturally:
> 🗣️ *"Give me a high level threat report for today."*
> 🗣️ *"Analyze the spam risk for the number +44 20 7946 0958."*

---

### Security & TOS Notice
SpamNumbers utilizes headless browsing technologies to aggregate public and community-sourced threat data. Always remain compliant with regional web regulations when operating heavy automated concurrent scraping cycles across enterprise domains. Unofficial API dependencies (e.g. Truecaller bypasses) have been rigorously removed from this framework to ensure full open-source integrity.
