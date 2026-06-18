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
- `useLocalStorage(key, init)` — persistent state backed by localStorage; does NOT support functional updates (pass direct value)
- `useNow()` — ticks every 30 s for countdown timers
- `useWindowWidth()` — drives responsive layout (wide ≥ 768 px)
- `useScoreFlash(score)` — detects score changes via `useRef`, returns `true` for 700 ms; used by `TeamRow` to apply `.wc-score-flash` CSS animation class
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
- Respects `wc_notif_favonly` + `wc_fav_teams` pref (array — reads `JSON.parse(localStorage.getItem("wc_fav_teams")) ?? []`)

### Favourite teams
- Stored as an array in `wc_fav_teams` (localStorage key). No cap — users can star as many teams as they like.
- Old key `wc_fav_team` (single string) is gone — no migration code, users lose the single saved fav.
- `toggleFavTeam(team)` in `App`: removes if already present, otherwise appends.
- Long-press (500 ms) on a team card in `TeamsTab` toggles the fav. `lpFired` ref prevents `onClick` from also firing. `onContextMenu` handles desktop right-click equivalent. `userSelect: "none"` / `WebkitUserSelect: "none"` / `WebkitTouchCallout: "none"` suppress OS text selection.

### Favourites-only filter
- "⭐ Favs" toggle pill sits beside the Group filter in `MatchesTab`. Only rendered when `favTeams.length > 0`.
- State: `const [favOnly, setFavOnly] = useLocalStorage("wc_favonly_filter", false)`.
- Filters `matches` so only those where `home` or `away` is in `favTeams` are shown; combined with the group filter (both conditions must pass).

### GlobalStyles CSS additions
```css
@keyframes wcScoreFlash { 0% { color: #22c55e; transform: scale(1.35); } 100% { color: inherit; transform: scale(1); } }
.wc-score-flash { animation: wcScoreFlash 0.65s ease; }
.wc-noscroll { scrollbar-width: none; -ms-overflow-style: none; }
.wc-noscroll::-webkit-scrollbar { display: none; }
```

### Fullscreen modal vertical centering (mobile)
The mobile `LiveMatchModal` scroll container uses `display: flex; flexDirection: column` and the inner content wrapper uses `margin: auto` — this centers when content fits and gracefully allows scrolling when content is taller than the viewport.

### Live audio commentary (attempted, removed)
Tried embedding live radio commentary (BBC Radio 5 Live stream for UK, link buttons for other regions). Removed because broadcaster deep-link URLs return 404s or redirect unpredictably — not worth the maintenance. Do not re-add unless a stable, embeddable, cross-origin stream source is confirmed working first.

### Git push pattern (SSH multi-account)
```bash
git fetch git@github-mshammas:mshammas/fifa2026.git main
git rebase FETCH_HEAD
git push git@github-mshammas:mshammas/fifa2026.git HEAD:main
```
The score bot commits `matches.json` frequently — always rebase before pushing to avoid conflicts.

## Current Status (v1.1)

All features complete and deployed:
- ✅ Live scores, goals, cards, stats, recaps (ESPN)
- ✅ Full schedule with date picker + Schedule→Matches navigation
- ✅ Group standings with qualification legend
- ✅ Knockout bracket
- ✅ Watch tab (streaming links + highlights)
- ✅ Fullscreen live match modal (3-panel wide layout, no-reload refresh; vertically centred on mobile)
- ✅ Browser notifications (goals / kick-off / FT / red cards / favourite team filter)
- ✅ Timezone popover
- ✅ Score predictor
- ✅ PWA (installable, offline-capable) — `InstallPrompt` banner shown on mobile when not already installed
- ✅ Live match ticker banner (scrolling horizontal chip row when 2+ live matches)
- ✅ Unlimited favourite teams — long-press to star/unstar; star icon in Teams tab
- ✅ Favourites-only filter ("⭐ Favs" pill beside Group filter in Matches tab; persisted in `wc_favonly_filter`)
- ✅ Share button per match + share-app button (🔗) in header
- ✅ Score pulse animation on goal (`useScoreFlash` + `.wc-score-flash`)
- ✅ Imminent kickoff countdown (⚡ shown when < 30 min to kickoff)
- ✅ Inline group standings in Matches tab when a single group is filtered
- ✅ Group filter persisted across sessions (`wc_group_filter` in localStorage)
- ✅ Fav-team nudge banner in Matches tab when no favs set
- ✅ Haptic feedback on long-press (navigator.vibrate)

### Font size floor (accessibility / elderly-friendly)
Minimum font sizes enforced across the app so it remains readable for elderly users:
- Nav tab labels: 12px
- Match card metadata (group, status, time): 15px
- Status badge pill: 14px
- Schedule row status label: 13px
- Fav spotlight header / detail row: 13px / 14px
- Prediction UI and tally: 14–15px
- Standings table cells: 15px
Do not regress these when adding new UI elements — check against this list.

## Keeping CLAUDE.md Up to Date

**After every session that changes behaviour, add a rule:** update this file before the final push so the next session starts with accurate context. Specifically update:
- Architecture Notes when a new hook, helper, or localStorage key is introduced
- Current Status when a feature is added or removed
- Any section whose documented behaviour no longer matches the code

## Environment Variables

None. No secrets, no tokens, no auth keys. All data is public.
