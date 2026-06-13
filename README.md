# FIFA World Cup 2026 — Live Scores App
⚽ Zero API tokens. Zero Claude usage. Pure static data.

## How It Works

1. **GitHub Action** (runs every 5 minutes on schedule)
   - Scrapes Wikipedia & ESPN for latest match scores
   - Parses the results into JSON
   - Commits `src/data/matches.json` back to the repo

2. **React App** (you + your family)
   - Imports the static JSON directly
   - No runtime API calls
   - Instant page load, no tokens burned

3. **GitHub Pages** (built & deployed by GitHub Actions)
   - `deploy.yml` runs `npm run build` and publishes `dist/`
   - Redeploys on every push and after each scraper update
   - Optional custom domain (fifa.shammas.in); free tier covers everything

## Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/mshammas/fifa2026.git
cd fifa2026
npm install
```

### 2. Generate Initial Data

```bash
npm run fetch-scores
```

This creates `src/data/matches.json` with baseline scores. Commit it:

```bash
git add src/data/matches.json
git commit -m "Initial match data"
git push
```

### 3. Enable GitHub Pages

- Go to the repo → **Settings → Pages**
- Under **Source**, select **GitHub Actions** (not "Deploy from a branch")
- The `deploy.yml` workflow builds (`npm run build`) and publishes `dist/`
- No environment variables or secrets needed

Your site goes live at `https://mshammas.github.io/fifa2026/`.

### 4. Activate the GitHub Action

The scraper (`.github/workflows/fetch-scores.yml`) runs automatically every 5 minutes. On each run it:
- Fetches latest scores from Wikipedia (+ ESPN for live status)
- Updates and commits `src/data/matches.json`
- That completion triggers `deploy.yml` (via `workflow_run`), rebuilding the site
- Your published site gets fresh data

You can also trigger either workflow manually from the **Actions** tab.

### 5. Add Your Custom Domain (optional)

GitHub Pages supports custom domains — no Cloudflare required:
- Settings → Pages → **Custom domain** → enter `fifa.shammas.in` → Save
- At your DNS provider for `shammas.in`, add a **CNAME**: `fifa` → `mshammas.github.io`
- GitHub auto-provisions HTTPS

Now your family visits `https://fifa.shammas.in` and always gets the latest data — automatically.

## Manual Score Updates

If the scraper misses a score or you want to update manually:

```bash
npm run fetch-scores
git add src/data/matches.json
git commit -m "Update scores"
git push
```

The Pages rebuild happens automatically.

## What Gets Scraped

- Match results (home score, away score, final/live status)
- Upcoming fixtures (kickoff times, groups)
- Baseline data (teams, venues, groups) — cached in the code, never changes

## Token Cost

**$0** — no API calls at runtime, no Claude usage, no secrets in the code.

Your family can share the link with anyone. Zero concerns about token exposure or exhaustion.

---

**Created by Shammas Oliyath** · No dependencies on paid APIs · Built with React + Vite + GitHub Pages
