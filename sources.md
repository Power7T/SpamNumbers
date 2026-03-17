# Data Sources — Spam Numbers Skill

## Local Database Scrapers (14 sources)

| Source | Region | Method | Weight | Notes |
|--------|--------|--------|--------|-------|
| FTC Do Not Call Registry | US | REST API | 1.0 | Government source, highest trust |
| 800notes.com | US | HTML scraping | 0.7 | Community reports |
| Should I Answer | US/Intl | HTML scraping | 0.7 | Community reports |
| YouMail Robocall Index | US | HTML scraping | 0.6 | Robocall analytics |
| SkipCalls.net | International | HTML scraping | 0.6 | Broad international coverage |
| WhoCallsMe.com | US | HTML scraping | 0.6 | Community reports |
| CallerCenter.com | US | HTML scraping | 0.6 | Community reverse lookup |
| SpamCalls.net | US/Intl | HTML scraping | 0.5 | Community reports (CF-protected, may skip) |
| Nomorobo Top Robocallers | US | HTML scraping | 0.5 | Top reported robocallers (CF-protected, may skip) |
| jwoertink/blocked-numbers | US | GitHub CSV | 0.4 | Community blocklist |
| Oros42/phone-blacklist | France/EU | GitHub CSV | 0.4 | French/EU community list |
| bretmlw/uk-phone-scam-numbers | UK | GitHub TXT | 0.4 | UK community list |
| greyhat-academy/lists.d | Global | GitHub TSV | 0.4 | International spam numbers |
| Swyter/call-spam-blocklist | Global | GitHub CSV | 0.4 | Multi-country blocklist |
| sundowndev/phone-number-based-spam-list | Global | GitHub CSV | 0.4 | Community blocklist |

## Online Lookup Fallback

| Source | Region | Method | Notes |
|--------|--------|--------|-------|
| SkipCalls API | International | Free REST API | 1M+ numbers, used when local DB misses |

## Scoring Weights

Government sources (FTC) are weighted highest at 1.0. Established community sites get 0.5–0.7. GitHub community lists get 0.4. When a number appears in multiple sources, the final score is a weighted average capped at 10.

## Coverage by Region

| Region | Local DB Sources | Online Fallback |
|--------|-----------------|-----------------|
| US | 9 scrapers | Yes |
| UK | 1 GitHub list | Yes |
| France/EU | 1 GitHub list | Yes |
| Global/Multi | 3 GitHub lists | Yes |
| Other | Phone format only | Yes (SkipCalls API) |

## Scraping Strategy

- Sources run in 3 parallel groups to avoid rate limiting
- Each source retries up to 2 times with exponential backoff (2s, 5s)
- If a source fails, remaining sources continue unaffected
- Scraper health is tracked — warns after 3 consecutive zero-result runs
