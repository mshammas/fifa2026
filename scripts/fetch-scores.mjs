#!/usr/bin/env node
/* ============================================================
   FIFA World Cup 2026 — score scraper (zero API tokens)

   Strategy:
   1. BASELINE below is the source of truth for STRUCTURE
      (which matches we display, their group, venue, kickoff).
   2. Wikipedia is scraped with cheerio for FINAL SCORES.
      The 2026 page uses the standard ".footballbox" template:
        .fdate "June 11, 2026 (2026-06-11)"
        .fhome "Mexico"   .fscore "2–0"   .faway "South Africa"
      A numeric score => Full Time; "Match 25" => not started.
   3. ESPN's public scoreboard JSON is a best-effort overlay for
      LIVE / Half-Time status (Wikipedia only shows finals). It is
      wrapped in try/catch — any failure is ignored.
   4. Everything merges onto BASELINE. If every source fails we
      still write the baseline, so matches.json is always valid.
   ============================================================ */
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../src/data/matches.json");
const WIKI_URL = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup";
const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

// Baseline matches — STRUCTURE never changes (teams, group, venue, kickoff).
// Scores/status get overwritten by the scrape when available.
const BASELINE = [
  { id:"b1", date:"2026-06-11T19:00:00Z", etTime:"3:00 PM",  home:"Mexico",      away:"South Africa",        group:"A", venue:"Estadio Azteca, Mexico City",   homeScore:2,    awayScore:0,    status:"FT" },
  { id:"b2", date:"2026-06-12T02:00:00Z", etTime:"10:00 PM", home:"South Korea", away:"Czechia",             group:"A", venue:"Estadio Akron, Guadalajara",    homeScore:null, awayScore:null, status:"NS" },
  { id:"b3", date:"2026-06-12T19:00:00Z", etTime:"3:00 PM",  home:"Canada",      away:"Bosnia & Herzegovina", group:"B", venue:"BMO Field, Toronto",            homeScore:null, awayScore:null, status:"NS" },
  { id:"b4", date:"2026-06-13T01:00:00Z", etTime:"9:00 PM",  home:"USA",         away:"Paraguay",             group:"D", venue:"SoFi Stadium, Los Angeles",     homeScore:null, awayScore:null, status:"NS" },
  { id:"b5", date:"2026-06-13T19:00:00Z", etTime:"3:00 PM",  home:"Qatar",       away:"Switzerland",          group:"B", venue:"Levi's Stadium, San Francisco", homeScore:null, awayScore:null, status:"NS" },
  { id:"b6", date:"2026-06-13T22:00:00Z", etTime:"6:00 PM",  home:"Brazil",      away:"Morocco",              group:"C", venue:"MetLife Stadium, New Jersey",   homeScore:null, awayScore:null, status:"NS" },
  { id:"b7", date:"2026-06-14T01:00:00Z", etTime:"9:00 PM",  home:"Haiti",       away:"Scotland",             group:"C", venue:"Gillette Stadium, Boston",      homeScore:null, awayScore:null, status:"NS" },
  { id:"b8", date:"2026-06-14T04:00:00Z", etTime:"12:00 AM", home:"Australia",   away:"Türkiye",              group:"D", venue:"BC Place, Vancouver",           homeScore:null, awayScore:null, status:"NS" },
];

// Map the various source spellings to our canonical (baseline) names.
const NAME_MAP = {
  "Czech Republic": "Czechia",
  "United States": "USA",
  "USMNT": "USA",
  "Turkey": "Türkiye",
  "Türkiye": "Türkiye",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "Korea Republic": "South Korea", // ESPN spelling
};
const canon = (name) => NAME_MAP[name?.trim()] ?? name?.trim() ?? "";
// Stable key for matching a scraped team to a baseline team.
const key = (name) => canon(name).toLowerCase();
const pairKey = (home, away) => `${key(home)}|${key(away)}`;

function fetchUrl(url, asJson = false) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; fifa2026-bot)" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchUrl(res.headers.location, asJson));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(asJson ? JSON.parse(data) : data));
      })
      .on("error", reject);
  });
}

// Parse "2–0" / "2-0" / "1–1" into [home, away]; returns null for "Match 25" etc.
function parseScore(text) {
  const m = (text || "").replace(/\s/g, "").match(/^(\d+)[–-](\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

// --- Source 1: Wikipedia (final scores, reliable) -------------------
async function scrapeWikipedia() {
  console.log("→ Fetching Wikipedia…");
  const html = await fetchUrl(WIKI_URL);
  const $ = cheerio.load(html);
  const results = [];
  $(".footballbox").each((_, el) => {
    const $b = $(el);
    const home = $b.find(".fhome").text().trim();
    const away = $b.find(".faway").text().trim();
    const score = parseScore($b.find(".fscore").text());
    if (!home || !away || !score) return; // skip placeholders / unplayed
    const dateMatch = $b.find(".fdate").text().match(/\((\d{4}-\d{2}-\d{2})\)/);
    results.push({
      pair: pairKey(home, away),
      homeScore: score[0],
      awayScore: score[1],
      status: "FT",
      date: dateMatch ? dateMatch[1] : null,
    });
  });
  console.log(`  ✓ Wikipedia: parsed ${$(".footballbox").length} boxes, ${results.length} with final scores`);
  return results;
}

// --- Source 2: ESPN (best-effort LIVE overlay) ----------------------
async function scrapeESPN() {
  try {
    console.log("→ Fetching ESPN scoreboard (live overlay)…");
    const data = await fetchUrl(ESPN_URL, true);
    const live = [];
    for (const ev of data?.events || []) {
      const comp = ev?.competitions?.[0];
      const state = comp?.status?.type?.state; // "pre" | "in" | "post"
      if (!comp || state !== "in") continue; // we only override for in-progress games
      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      if (!home || !away) continue;
      const detail = (comp.status?.type?.shortDetail || "").toLowerCase();
      live.push({
        pair: pairKey(home.team?.displayName, away.team?.displayName),
        homeScore: parseInt(home.score, 10),
        awayScore: parseInt(away.score, 10),
        status: detail.includes("half") ? "HT" : "LIVE",
      });
    }
    console.log(`  ✓ ESPN: ${live.length} live match(es)`);
    return live;
  } catch (e) {
    console.warn(`  ⚠ ESPN overlay skipped: ${e.message}`);
    return [];
  }
}

async function main() {
  // Deep-clone baseline so we always have a complete, valid set to write.
  const matches = BASELINE.map((m) => ({ ...m }));
  const byPair = new Map(matches.map((m) => [pairKey(m.home, m.away), m]));
  let updated = 0;
  let sources = [];

  // 1) Wikipedia final scores (primary).
  try {
    const wiki = await scrapeWikipedia();
    for (const r of wiki) {
      const m = byPair.get(r.pair);
      if (!m) continue;
      m.homeScore = r.homeScore;
      m.awayScore = r.awayScore;
      m.status = r.status;
      updated++;
    }
    if (wiki.length) sources.push("Wikipedia");
  } catch (e) {
    console.warn(`  ⚠ Wikipedia scrape failed, keeping baseline: ${e.message}`);
  }

  // 2) ESPN live overlay (only upgrades matched in-progress games).
  const espn = await scrapeESPN();
  for (const r of espn) {
    const m = byPair.get(r.pair);
    if (!m) continue;
    if (Number.isFinite(r.homeScore)) m.homeScore = r.homeScore;
    if (Number.isFinite(r.awayScore)) m.awayScore = r.awayScore;
    m.status = r.status;
    updated++;
  }
  if (espn.length) sources.push("ESPN (live)");

  const output = {
    matches,
    lastUpdated: new Date().toISOString(),
    source:
      sources.length > 0
        ? `${sources.join(" + ")} scrape · zero API tokens used`
        : "Baseline data (scrape unavailable) · zero API tokens used",
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");

  console.log(`\n✓ Wrote ${matches.length} matches to src/data/matches.json`);
  console.log(`✓ Updated ${updated} score(s) from: ${sources.join(", ") || "none (baseline only)"}`);
  console.log(`✓ Last updated: ${output.lastUpdated}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
