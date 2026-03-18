# 🤖 Master AI Blueprint & Project Walkthrough: Spam Numbers

**ATTENTION NEW SESSION:** This is your one-stop "Super Blueprint". It contains the logistics for running the project AND the full development history from Phase 1 to Phase 5. Read this first.

---

## 🎯 1. Project Context & Objectives
A production-grade **Spam Caller Database** scraper and lookup tool. Aggregates data from FTC, Tellows, Sync.me, GitHub, and Nomorobo.
- **Goal:** Provide instant spam-risk assessments for international phone numbers.
- **Platform:** Ubuntu VPS (85.208.51.22) integrated with the **OpenClaw TUI**.

## 🏗️ 2. File Structure & Logistics
- **Local Path:** `/Users/chandan/Desktop/AlttrueGithub/SpamNumbers`
- **VPS Path:** `/root/.openclaw/workspace/skills/spam-numbers/scripts/`
- **Critical Command Table:**
  | Goal | Command |
  |------|---------|
  | Full Scrape | `node scripts/index.js scrape` |
  | Live Status | `node scripts/index.js status` |
  | DB Stats | `node scripts/index.js stats` |
  | Export CSV | `node scripts/index.js export` |
  | VPS Restart | `systemctl --user restart openclaw-gateway.service` |

---

## 🕒 3. Full Project Walkthrough (Start-to-Finish)

### Phase 1: Core Foundation & Database
- **SQLite Database**: Optimized schema with indices on phone numbers and weighted scores.
- **Normalization**: Handles international formatting to ensure deduplication across sources.

### Phase 2: Scraper & Data Pipeline
- **FTC Scraper**: Tailored parser for daily DNC complaint CSVs and history archives.
- **Universal Scrapers**: Built tailored parsers for GitHub Lists, Sync.me, Tellows, and Nomorobo.
- **Validators**: Supports NumVerify/AbstractAPI fallback for carrier-level validation.

### Phase 3: Orchestration & Maintenance
- **The Orchestrator**: Manages parallel execution groups with automated retries and backoff.
- **Score Decay**: Automated system to ensure older spam records lose weighting over time.
- **Health Tracking**: Detects broken/blocked sources automatically.

### Phase 4: Production VPS Deployment
- **Ubuntu Optimization**: Manually rebuilt **`better-sqlite3` native bindings** for the VPS Linux architecture. (DO NOT REINSTALL).
- **Systemd**: Managed via `openclaw-gateway.service` for 24/7 reliability.

### Phase 5: OpenClaw TUI Integration (Recent Fixes)
- **Agent Phrasing**: Mapped `scrape/scan` terms directly to the script via **SKILL.md** to prevent AI hallucinations.
- **Live Heartbeats**: Implemented real-time progress logging to `latest-scrape-progress.log`. Use the `status` command to poll mid-scrape.
- **Memory Wipe**: Verified that the Agent's session history in `/root/.openclaw/agents/main/sessions/` must be cleared if it gets stuck.

---

## 🔧 4. Critical "Fix" Knowledge (For New AI Agents)
- **hallucination?**: If the TUI says "module not found," but the VPS shell says it is working, HARD WIPE the agent's session JSONs. The agent is lying based on old history.
- **Permissions**: Always ensure all scripts in `/root/.openclaw/workspace/skills/spam-numbers/scripts/` have `chmod +x` if execution fails.

---
**Status:** ✅ Production Ready. Stable. Documented.
