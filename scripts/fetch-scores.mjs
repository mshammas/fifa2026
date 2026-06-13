#!/usr/bin/env node
/* ============================================================
   FIFA World Cup 2026 — score scraper (zero API tokens)

   Sources, in priority order:
   1. ESPN public scoreboard JSON (PRIMARY). Stable structured data, no key,
      datacenter-friendly, near-real-time. Gives live in-progress scores,
      half-time, and final scores. Queried for the date range that the
      baseline fixtures span.
        site.api.espn.com/.../soccer/fifa.world/scoreboard?dates=YYYYMMDD-YYYYMMDD
      status.type.state: "pre" (not started) | "in" (live) | "post" (full time)
   2. Wikipedia footballbox tables via cheerio (FALLBACK). Used for any
      fixture ESPN didn't resolve (e.g. a name it spells differently, or an
      event it omitted). Only carries FINAL scores.
   3. BASELINE below (ULTIMATE FALLBACK) — the fixed structure (teams, group,
      venue, kickoff) and a sane default score/status if every source fails.

   The result always contains every baseline match, so matches.json is valid
   even when both network sources are unreachable.
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
// Scores/status get overwritten by ESPN (primary) or Wikipedia (fallback).
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
  "Czech Republic": "Czechia",        // Wikipedia
  "United States": "USA",             // ESPN
  "USMNT": "USA",
  "Turkey": "Türkiye",
  "Türkiye": "Türkiye",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina", // Wikipedia
  "Bosnia-Herzegovina": "Bosnia & Herzegovina",     // ESPN
  "Korea Republic": "South Korea",    // ESPN (alt)
};
const canon = (name) => NAME_MAP[name?.trim()] ?? name?.trim() ?? "";
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

// Parse "2–0" / "2-0" into [home, away]; returns null for "Match 25" etc.
function parseScore(text) {
  const m = (text || "").replace(/\s/g, "").match(/^(\d+)[–-](\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

// --- Source 1: ESPN (PRIMARY — live + final) ------------------------
// Returns Map<pairKey, { status, homeScore, awayScore }>.
async function scrapeESPN() {
  const times = BASELINE.map((m) => new Date(m.date).getTime());
  // Widen the window by a day each side so timezone interpretation can't clip it.
  const range = `${ymd(Math.min(...times) - 864e5)}-${ymd(Math.max(...times) + 864e5)}`;
  console.log(`→ Fetching ESPN scoreboard (${range})…`);
  const data = await fetchUrl(`${ESPN_URL}?dates=${range}`, true);
  const out = new Map();
  for (const ev of data?.events || []) {
    const comp = ev?.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === "home");
    const away = comp?.competitors?.find((c) => c.homeAway === "away");
    if (!home?.team || !away?.team) continue;
    const t = comp.status?.type || {};
    let status, hs = null, as = null;
    if (t.state === "post") {
      status = "FT";
      hs = parseInt(home.score, 10);
      as = parseInt(away.score, 10);
    } else if (t.state === "in") {
      const halftime = t.name === "STATUS_HALFTIME" || (t.shortDetail || "").trim() === "HT";
      status = halftime ? "HT" : "LIVE";
      hs = parseInt(home.score, 10);
      as = parseInt(away.score, 10);
    } else {
      status = "NS"; // "pre" — leave scores null (ESPN reports 0-0 pre-match)
    }
    out.set(pairKey(home.team.displayName, away.team.displayName), {
      status,
      homeScore: Number.isFinite(hs) ? hs : null,
      awayScore: Number.isFinite(as) ? as : null,
    });
  }
  console.log(`  ✓ ESPN: ${out.size} matches in window`);
  return out;
}

// --- Source 2: Wikipedia (FALLBACK — finals only) -------------------
// Returns Map<pairKey, { status:"FT", homeScore, awayScore }>.
async function scrapeWikipedia() {
  console.log("→ Fetching Wikipedia (fallback)…");
  const html = await fetchUrl(WIKI_URL);
  const $ = cheerio.load(html);
  const out = new Map();
  $(".footballbox").each((_, el) => {
    const $b = $(el);
    const home = $b.find(".fhome").text().trim();
    const away = $b.find(".faway").text().trim();
    const score = parseScore($b.find(".fscore").text());
    if (!home || !away || !score) return; // skip placeholders / unplayed
    out.set(pairKey(home, away), { status: "FT", homeScore: score[0], awayScore: score[1] });
  });
  console.log(`  ✓ Wikipedia: ${out.size} finals`);
  return out;
}

async function main() {
  // Always start from a complete, valid baseline.
  const matches = BASELINE.map((m) => ({ ...m }));

  let espn = new Map();
  let wiki = new Map();
  try { espn = await scrapeESPN(); }
  catch (e) { console.warn(`  ⚠ ESPN failed, falling back: ${e.message}`); }
  try { wiki = await scrapeWikipedia(); }
  catch (e) { console.warn(`  ⚠ Wikipedia failed: ${e.message}`); }

  let fromEspn = 0, fromWiki = 0;
  for (const m of matches) {
    const pk = pairKey(m.home, m.away);
    const e = espn.get(pk);
    const w = wiki.get(pk);

    if (e && e.status !== "NS") {
      // ESPN is the authority for anything live or finished (freshest).
      m.homeScore = e.homeScore;
      m.awayScore = e.awayScore;
      m.status = e.status;
      fromEspn++;
    } else if (w) {
      // ESPN didn't have a result; use Wikipedia's final if present.
      m.homeScore = w.homeScore;
      m.awayScore = w.awayScore;
      m.status = w.status;
      fromWiki++;
    } else if (e && e.status === "NS") {
      // Both agree the match hasn't started.
      m.homeScore = null;
      m.awayScore = null;
      m.status = "NS";
    }
    // else: no source matched — keep the baseline value.
  }

  const parts = [];
  if (fromEspn) parts.push("ESPN (live)");
  if (fromWiki) parts.push("Wikipedia (fallback)");

  const output = {
    matches,
    lastUpdated: new Date().toISOString(),
    source: parts.length
      ? `${parts.join(" + ")} · zero API tokens used`
      : "Baseline data (sources unavailable) · zero API tokens used",
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");

  console.log(`\n✓ Wrote ${matches.length} matches to src/data/matches.json`);
  console.log(`✓ Scores: ${fromEspn} from ESPN, ${fromWiki} from Wikipedia fallback`);
  console.log(`✓ Last updated: ${output.lastUpdated}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
