# FIFA 2026 — World Cup Live Scores App
⚽ Zero API tokens. Static data from ESPN public API. GitHub Pages + GitHub Actions.

## Project Overview

**What it does:**
- Live FIFA World Cup 2026 match scores, goals, cards, stats and recaps
- Full schedule (104 matches), group standings, knockout bracket, watch/highlights links
- Auto-updates every 5 minutes via GitHub Action scraping ESPN's public scoreboard API
- Timezone picker (popover), browser notifications (goals/kick-off/FT/red cards), score predictor
- Fullscreen live match view: 3-panel layout (Score | Goals | Stats) on desktop/tablet, single-column on mobile
- Installable as PWA (service worker + manifest)
- Zero runtime API calls, zero token usage by viewers
- Deployed on GitHub Pages, custom domain `fifa.shammas.in`

**Tech Stack:**
- Frontend: React 18 + Vite, inline styles (single file `src/main.jsx`)
- Backend: GitHub Actions (scheduled Node.js scraper)
- Hosting: GitHub Pages (built & deployed by GitHub Actions on every push)
- Data: Static JSON (`src/data/matches.json`) imported at build time; refreshed dynamically in the fullscreen modal via `fetch()`

## Key Files

- `src/main.jsx` — Entire React app (all components, hooks, styles in one file)
- `src/data/matches.json` — Match data (scores, goals, cards, stats, recaps) — auto-updated by scraper
- `scripts/fetch-scores.mjs` — ESPN scraper: fetches standings + scoreboard, builds matches.json
- `.github/workflows/fetch-scores.yml` — Runs scraper every 5 minutes, commits JSON, triggers deploy
- `.github/workflows/deploy.yml` — Builds with Vite and deploys to GitHub Pages
- `vite.config.js` — `base: './'` so assets work at both root domain and Pages subpath
- `index.html` — HTML shell with PWA meta tags and OG/Twitter cards
- `public/sw.js` — Service worker: cache-first for assets, network-first for HTML
- `public/manifest.json` — PWA manifest (name, icons, theme)
- `docs/screenshots/` — App screenshots used in README.md

## Getting Started

```bash
npm install
npm run dev          # http://localhost:5173
npm run fetch-scores # Update src/data/matches.json from ESPN
npm run build        # Output in dist/
```

## Architecture Notes

### Data flow
ESPN scoreboard API → `fetch-scores.mjs` → `matches.json` → Vite build → GitHub Pages bundle

### Match data shape (each entry in `matches.json`)
```json
{
  "id": "e123",
  "date": "2026-06-15T19:00:00Z",
  "home": "Sweden", "away": "Tunisia",
  "group": "F",
  "venue": "Estadio BBVA, Guadalupe",
  "homeScore": 2, "awayScore": 1,
  "status": "FT",          // NS | LIVE | HT | FT
  "clock": "53'",          // live minute, null otherwise
  "goals": [{ "side": "home", "player": "A. Isak", "minute": "30'", "pen": false, "og": false }],
  "cards": [{ "side": "away", "player": "O. Rekik", "minute": "43'", "type": "yellow" }],
  "homeStats": { "possessionPct": "54.1", "totalShots": "5", "shotsOnTarget": "3" },
  "awayStats": { "possessionPct": "45.9", "totalShots": "3", "shotsOnTarget": "1" },
  "recap": "Sweden held on for a 2-1 win over Tunisia..."
}
```

### Key hooks / helpers in `src/main.jsx`
- `useLocalStorage(key, init)` — persistent state backed by localStorage
- `useNow()` — ticks every 30 s for countdown timers
- `useWindowWidth()` — drives responsive layout (wide ≥ 768 px)
- `liveScores(m)` — derives score from `goals[]` array (more up-to-date than ESPN score field during live play)
- `refreshMatches()` — `fetch('./src/data/matches.json?t=<now>')` used by LiveMatchModal to update state without a page reload (preserves fullscreen)

### CSS Grid overflow gotcha (mobile)
Auto-sized CSS Grid columns (`grid-template-columns: none`) allow grid items to expand to their intrinsic max-content width, causing content to overflow the card boundary on mobile Safari. Fix: always use `gridTemplateColumns: "minmax(0, 1fr)"` on grids inside constrained containers (cards, modals). This sets column min=0, max=fill-available, preventing blowout. Affected grids in LiveCard:
- The expanded section (`borderTop` div with `display: grid; gap: 16`)
- `MatchEvents` return div (`display: grid; gap: 16`)

The live card outer div also has `overflow: hidden` as a safety backstop.

### Notification system
- Reads all prefs directly from localStorage inside the score-change `useEffect` (avoids stale closure)
- Tracks `{ h, a, status, redCards }` per match in `wc_prev_scores`
- Fires `new Notification(title, { body, icon })` for goals, kick-off (NS→LIVE), full time (→FT), red cards
- Respects `wc_notif_favonly` + `wc_fav_team` pref

### Git push pattern (SSH multi-account)
```bash
git fetch git@github-mshammas:mshammas/fifa2026.git main
git rebase FETCH_HEAD
git push git@github-mshammas:mshammas/fifa2026.git HEAD:main
```
The score bot commits `matches.json` frequently — always rebase before pushing to avoid conflicts.

## Current Status (v1.0)

All features complete and deployed:
- ✅ Live scores, goals, cards, stats, recaps (ESPN)
- ✅ Full schedule with date picker + Schedule→Matches navigation
- ✅ Group standings with qualification legend
- ✅ Knockout bracket
- ✅ Watch tab (streaming links + highlights)
- ✅ Fullscreen live match modal (3-panel wide layout, no-reload refresh)
- ✅ Browser notifications (goals / kick-off / FT / red cards / favourite team filter)
- ✅ Timezone popover
- ✅ Score predictor
- ✅ PWA (installable, offline-capable)
- ✅ Live match ticker banner
- ✅ Favourite team starring
- ✅ Share button per match

## Environment Variables

None. No secrets, no tokens, no auth keys. All data is public.
