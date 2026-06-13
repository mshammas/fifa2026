# FIFA 2026 — World Cup Live Scores App
⚽ Zero API tokens. Static data sourced from public web scraping. GitHub Pages + GitHub Actions.

## Project Overview

**What it does:**
- Live FIFA World Cup 2026 match scores, schedules, standings
- Auto-updates every 6 hours via GitHub Action scraping Wikipedia/ESPN
- Timezone picker for family viewing across regions
- Zero runtime API calls, zero token usage by viewers
- Deployed on GitHub Pages (optional custom domain `fifa.shammas.in`)

**Tech Stack:**
- Frontend: React 18 + Vite, inline styles (elder-friendly UI, large fonts)
- Backend: GitHub Actions (scheduled Node.js scraper)
- Hosting: GitHub Pages (built & deployed by GitHub Actions on every push)
- Data: Static JSON imported at build time

## Key Files

- `src/main.jsx` — React app entry point (has timezone picker, schedule, standings, watch links)
- `src/data/matches.json` — Static match data (auto-updated by GitHub Action)
- `scripts/fetch-scores.mjs` — Web scraper (runs on schedule, commits JSON)
- `.github/workflows/fetch-scores.yml` — scraper Action (every 6 hours, commits JSON)
- `.github/workflows/deploy.yml` — builds and deploys the site to GitHub Pages
- `vite.config.js` — Build config (`base: './'` so it works at the Pages subpath or a root domain)
- `index.html` — HTML shell
- `package.json` — Dependencies (React, Vite, Cheerio for scraping)

## Getting Started (Claude Code)

### Install
```bash
npm install
```

### Run locally
```bash
npm run dev
# Visit http://localhost:5173
```

### Test the scraper
```bash
npm run fetch-scores
# Updates src/data/matches.json with latest scores
```

### Build for production
```bash
npm run build
# Output in dist/
```

## Current Status

- ✅ Project structure ready
- ✅ GitHub Action workflow configured
- ✅ Baseline matches.json in place
- ⏳ React component needs to be ported from artifact
- ⏳ Scraper needs full HTML parsing (cheerio library)
- ⏳ Test locally + deploy

## Next Steps

1. **Port the React component** — Copy the app UI from the artifact (worldcup-2026-live.jsx in chat history) into `src/main.jsx`
   - Remove all fetch/API calls (data comes from imported JSON)
   - Keep timezone picker, match cards, standings, watch links
   - Keep elder-friendly design (large fonts, high contrast)

2. **Enhance the scraper** — Flesh out `scripts/fetch-scores.mjs`
   - Use cheerio to parse Wikipedia match tables
   - Extract home team, away team, score, status, date
   - Merge with baseline.json structure (groups, venues, kickoff times)
   - Test locally with `npm run fetch-scores`

3. **Test locally** — `npm run dev`, verify matches load
   - Check timezone picker works
   - Verify standings compute from static data
   - Test on mobile viewport (elder-friendly UX)

4. **Deploy to GitHub Pages**
   - Repo → Settings → Pages → Source: **GitHub Actions**
   - The `deploy.yml` workflow builds (`npm run build`) and publishes `dist/`
   - Live at `https://mshammas.github.io/fifa2026/`
   - Optional custom domain `fifa.shammas.in`: set it in Settings → Pages and add a
     DNS CNAME `fifa` → `mshammas.github.io`

5. **Verify GitHub Actions work**
   - Actions tab → run/check "Fetch World Cup Scores" and "Deploy to GitHub Pages"
   - Scraper commits `src/data/matches.json`; that completion fires the deploy
     via `workflow_run`, rebuilding the site with fresh scores

## Known Limitations / To-Do

- Scraper is currently a stub — needs cheerio integration
- Wikipedia parsing may be fragile if page structure changes (fallback to baseline data)
- Ask AI tab is removed (no API tokens; could add if needed later)
- Manual match updates: `npm run fetch-scores` + `git push` if scraper fails

## Environment Variables

None needed! This is the whole point — no secrets, no tokens, no auth keys.

All data is public (scraping Wikipedia), all code is visible (GitHub repo is public), all builds are free (GitHub Pages + Actions free tier).

## Questions?

Check the README.md for full setup instructions. Open an issue or commit to this repo and Claude Code will see it.

---

**Created by Shammas Oliyath** · Built during World Cup 2026 tournament
