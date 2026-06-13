# FIFA World Cup 2026 — Live Scores App
⚽ Zero API tokens. Zero Claude usage. Pure static data.

## How It Works

1. **GitHub Action** (runs every 6 hours on schedule)
   - Scrapes Wikipedia & ESPN for latest match scores
   - Parses the results into JSON
   - Commits `src/data/matches.json` back to the repo

2. **React App** (you + your family)
   - Imports the static JSON directly
   - No runtime API calls
   - Instant page load, no tokens burned

3. **Cloudflare Pages** (deploys on every commit)
   - Rebuilds the site automatically
   - Custom domain support (fifa.shammas.in)
   - Free tier covers everything

## Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/shammas/wc26-cloudflare.git
cd wc26-cloudflare
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

### 3. Connect to Cloudflare Pages

- Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
- Connect your GitHub repo
- Build command: `npm run build`
- Build output: `dist`
- Environment variable: none needed (no secrets!)
- Deploy

### 4. Activate the GitHub Action

The workflow file (`.github/workflows/fetch-scores.yml`) runs automatically every 6 hours. On first run, it will:
- Fetch latest scores from Wikipedia
- Update `src/data/matches.json`
- Trigger a Pages rebuild
- Your published site gets fresh data

### 5. Add Your Custom Domain

In Cloudflare Pages settings:
- Add custom domain: `fifa.shammas.in`
- Follow the DNS prompt

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

**Created by Shammas Oliyath** · No dependencies on paid APIs · Built with React + Vite + Cloudflare Pages
