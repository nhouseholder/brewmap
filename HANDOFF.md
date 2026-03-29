# Handoff — BrewMap — 2026-03-29 14:55
## Model: Claude Opus 4.6 (1M context)
## Previous handoff: First session
## GitHub repo: nhouseholder/brewmap
## Local path: ~/Library/Mobile Documents/com~apple~CloudDocs/ProjectsHQ/Brewmaps/
## Last commit date: 2026-03-29

---

## 1. Session Summary
User had a BrewMap coffee discovery app built by Claude Dispatch but never saved to GitHub. Recovered the app from the live Cloudflare Pages deployment, created GitHub repo, then ran a comprehensive improvement cycle: site audit, multi-agent site review, QA testing, and feature development. App went from a demo with fake data labels to a polished product with honest labeling, global city search, URL sharing, error recovery, and a spec for the next major phase (data pipeline).

## 2. What Was Done
- **Recovered app from Cloudflare**: Downloaded live HTML from brewmap-app.pages.dev, created GitHub repo nhouseholder/brewmap
- **Fixed geolocation**: Auto-detect location on load, added Overpass API fallback endpoint, rescan on radius change
- **Site audit (6 phases)**: Found 37 issues across P0-P3. Fixed 13: accessibility zoom, OSM attribution, fake review labels, timeout reduction, detail panel stale data, abort controller wiring, contrast fix, dead code cleanup
- **Multi-agent site review**: Dispatched 2 parallel agents (frontend + full-stack). Nielsen's score 27/40, AI slop 4/10. Identified data honesty as #1 strategic issue
- **v2.1 fixes**: Removed 700ms fake sleep delays, deferred Leaflet loading, trimmed fonts, fixed all misleading "AI analysis" labels, added persistent error state with Retry/Dismiss, added OG meta tags, displays real OSM hours/website/phone
- **v3.0 city search**: Added Nominatim geocoding search — any city in the world. URL hash routing for shareable links
- **QA testing**: Found search dropdown hidden by overflow. Fixed. Replaced broken maps.mail.ru Overpass fallback with openstreetmap.ru
- **Data pipeline spec**: Wrote SPEC-data-pipeline.md for Overpass scraper + Cloudflare KV caching (modeled after MyStrainAI harvest architecture)

## 3. What Failed (And Why)
- **maps.mail.ru Overpass fallback returned 403**: Added as third fallback but it blocks browser requests. Replaced with overpass.openstreetmap.ru. Lesson: test endpoints before shipping.
- **Search dropdown invisible**: Added city search but `overflow-x:auto` on parent container clipped the dropdown. Fixed by changing to `overflow:visible` and setting z-index 9999. Lesson: dropdowns inside scrollable containers need special handling.
- **Overpass API intermittent failures**: All 3 endpoints timed out during QA testing. This is the core reliability problem that the data pipeline spec addresses.

## 4. What Worked Well
- Multi-agent site review (parallel frontend + full-stack reviewers) produced genuinely useful findings
- Modeling the data pipeline after MyStrainAI's harvest pattern — proven architecture
- Error recovery UI with Retry/Dismiss buttons was immediately useful during QA when APIs were down
- Incremental deploy-test-fix cycle caught bugs before they reached users

## 5. What The User Wants
- Coffee discovery app that works reliably (no Overpass timeouts)
- Honest labeling of AI-generated data
- The MyStrainAI scraping pattern adapted for coffee shops: "do one massive scrape and store all the data, then just have it auto update weekly"
- Global city coverage, not just 3 hardcoded cities

## 6. In Progress (Unfinished)
- **Data pipeline build**: SPEC-data-pipeline.md is written but not implemented. This is the next major task.
  - scripts/harvest-coffee-shops.mjs — the scraper
  - scripts/lib/kv-writer.mjs — KV write logic
  - .github/workflows/harvest-coffee.yml — weekly cron
  - Cloudflare Worker API to serve cached data
  - Frontend update to read from KV instead of Overpass

## 7. Blocked / Waiting On
- Need to create Cloudflare KV namespace "brewmap-cache" before running the harvester
- Need CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID as GitHub secrets (may already exist from MyStrainAI)

## 8. Next Steps (Prioritized)
1. **Build the data pipeline** — Read SPEC-data-pipeline.md, implement scraper + KV + workflow. This eliminates all Overpass reliability issues.
2. **Add accessibility** — Convert interactive divs to buttons, add ARIA labels, keyboard navigation (P1 from site review, deferred)
3. **Integrate real review data** — Google Places API or Yelp Fusion for actual ratings/reviews + LLM flavor extraction (the product-defining feature)

## 9. Agent Observations
### Recommendations
- The data pipeline is the highest-leverage change. Once shops are cached in KV, the app loads instantly and never hits Overpass at runtime.
- Consider adding the Cloudflare Worker as a Pages Function instead of a separate Worker — simpler deployment.
- The project should get a package.json now that it has scripts/ and workflows coming.

### Data Contradictions Detected
No data contradictions.

### Where I Fell Short
- Added maps.mail.ru as a fallback without testing it first — it returned 403 immediately. Should have verified before deploying.
- The search dropdown overflow bug should have been caught during implementation, not in QA. Need to test dropdowns inside containers with overflow properties.

## 10. Miscommunications
None — session aligned.

## 11. Files Changed
```
SPEC-data-pipeline.md | 107 ++++++++++++++++++++++
index.html            | 245 +++++++++++++++++++++++++++++++-----------
2 files changed, 300 insertions(+), 52 deletions(-)
```

| File | Action | Why |
|------|--------|-----|
| index.html | Major update | Geolocation fix, audit fixes, review fixes, city search, URL routing, error recovery, honesty labels, OSM data display |
| SPEC-data-pipeline.md | Created | Spec for Overpass scraper + KV caching pipeline |
| _audit/ | Created | 5 phase reports from site audit |
| _review/ | Created | 3 review files from multi-agent site review |
| _qa/ | Created | QA test report |

## 12. Current State
- **Branch**: main
- **Last commit**: c48214f — Add data pipeline spec (2026-03-29)
- **Build**: N/A — no build system (single HTML file)
- **Deploy**: Deployed to brewmap-app.pages.dev via wrangler
- **Uncommitted changes**: none
- **Local SHA matches remote**: yes

## 13. Environment
- **Node.js**: v25.6.1
- **Python**: 3.14.3
- **Dev servers**: none

## 14. Session Metrics
- **Duration**: ~120 minutes
- **Tasks**: 8 completed / 8 attempted
- **User corrections**: 0
- **Commits**: 8
- **Skills used**: site-audit, site-review, site-debug, qa-test

## 15. Memory Updates
No project memory files created — this is a new project without a .claude/projects/ memory directory yet.
No anti-patterns logged (bugs were minor and fixed inline).

## 16. Skills Used
| Skill | Purpose | Helpful? |
|-------|---------|----------|
| site-audit | 6-phase comprehensive audit | Yes — found 37 issues |
| site-review | Multi-agent strategic review | Yes — identified data honesty as top priority |
| site-debug | Auto-investigate for bugs | Yes — confirmed no bugs post-fixes |
| qa-test | Structured QA with browser testing | Yes — found search dropdown bug |

## 17. For The Next Agent
Read these files first (in order):
1. This handoff (HANDOFF.md)
2. SPEC-data-pipeline.md — the spec for the next major task
3. index.html — the entire app (single file, ~850 lines)
4. _review/frontend_review.md — detailed frontend findings
5. _review/fullstack_review.md — detailed product findings

**Canonical local path: ~/Library/Mobile Documents/com~apple~CloudDocs/ProjectsHQ/Brewmaps/**
**GitHub repo: https://github.com/nhouseholder/brewmap**
**Live site: https://brewmap-app.pages.dev**
**Do NOT open from /tmp/. Use the iCloud path above. No local git — push via /tmp/ clone.**

---
## NEXT AGENT: MANDATORY STARTUP SEQUENCE
Before doing ANY work, verify:
1. You're working on nhouseholder/brewmap (NOT another project)
2. Clone from GitHub to /tmp/ for any git operations (iCloud dir has no .git)
3. Read this handoff + SPEC-data-pipeline.md before writing code
4. The main task is: BUILD THE DATA PIPELINE from the spec

**Last verified commit: c48214f on 2026-03-29**
