#!/usr/bin/env node
/* ============================================================
   FIFA World Cup 2026 — score scraper (zero API tokens)

   PRIMARY: ESPN public JSON (no key, datacenter-friendly).
   - standings endpoint  -> team → group letter (A..L) for all 48 teams
   - scoreboard endpoint -> every fixture (queried in date windows because
     ESPN caps ~100 events per request). For each match we get teams, date,
     venue, live/final score, status, live minute, goals and cards.
   This yields the FULL tournament schedule (group stage + knockouts).

   FALLBACK: the 8 opening fixtures below, merged with Wikipedia final scores,
   used only if ESPN is unreachable — so matches.json is always valid.
   ============================================================ */
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../src/data/matches.json");
const WIKI_URL = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup";
const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const ESPN_STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";

// The whole tournament, split into windows (ESPN returns ~100 events max/query).
const WINDOWS = ["20260611-20260620", "20260621-20260630", "20260701-20260710", "20260711-20260719"];

// Fallback fixtures (opening matches) if ESPN is unreachable.
const BASELINE = [
  { id:"b1", date:"2026-06-11T19:00:00Z", home:"Mexico",      away:"South Africa",        group:"A", venue:"Estadio Azteca, Mexico City",   homeScore:2,    awayScore:0,    status:"FT" },
  { id:"b2", date:"2026-06-12T02:00:00Z", home:"South Korea", away:"Czechia",             group:"A", venue:"Estadio Akron, Guadalajara",    homeScore:null, awayScore:null, status:"NS" },
  { id:"b3", date:"2026-06-12T19:00:00Z", home:"Canada",      away:"Bosnia & Herzegovina", group:"B", venue:"BMO Field, Toronto",            homeScore:null, awayScore:null, status:"NS" },
  { id:"b4", date:"2026-06-13T01:00:00Z", home:"USA",         away:"Paraguay",             group:"D", venue:"SoFi Stadium, Los Angeles",     homeScore:null, awayScore:null, status:"NS" },
  { id:"b5", date:"2026-06-13T19:00:00Z", home:"Qatar",       away:"Switzerland",          group:"B", venue:"Levi's Stadium, San Francisco", homeScore:null, awayScore:null, status:"NS" },
  { id:"b6", date:"2026-06-13T22:00:00Z", home:"Brazil",      away:"Morocco",              group:"C", venue:"MetLife Stadium, New Jersey",   homeScore:null, awayScore:null, status:"NS" },
  { id:"b7", date:"2026-06-14T01:00:00Z", home:"Haiti",       away:"Scotland",             group:"C", venue:"Gillette Stadium, Boston",      homeScore:null, awayScore:null, status:"NS" },
  { id:"b8", date:"2026-06-14T04:00:00Z", home:"Australia",   away:"Türkiye",              group:"D", venue:"BC Place, Vancouver",           homeScore:null, awayScore:null, status:"NS" },
];

// Canonicalise the few names that differ between sources / our flag map.
const NAME_MAP = {
  "Czech Republic": "Czechia",
  "United States": "USA",
  "USMNT": "USA",
  "Turkey": "Türkiye",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "Bosnia-Herzegovina": "Bosnia & Herzegovina",
  "Korea Republic": "South Korea",
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

function parseScore(text) {
  const m = (text || "").replace(/\s/g, "").match(/^(\d+)[–-](\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

// ESPN standings → { teamKey: "A".."L" } for all 48 teams.
async function fetchGroups() {
  const data = await fetchUrl(ESPN_STANDINGS, true);
  const map = {};
  for (const g of data.children || []) {
    const letter = (g.name || "").replace(/group/i, "").trim();
    for (const e of g.standings?.entries || []) {
      if (e.team?.displayName) map[key(e.team.displayName)] = letter;
    }
  }
  return map;
}

// Turn one ESPN scoreboard event into our match shape.
function extractMatch(ev, groupMap) {
  const comp = ev?.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === "home");
  const away = comp?.competitors?.find((c) => c.homeAway === "away");
  if (!comp || !home?.team || !away?.team) return null;

  const t = comp.status?.type || {};
  let status, hs = null, as = null, clock = null;
  if (t.state === "post") {
    status = "FT";
    hs = parseInt(home.score, 10);
    as = parseInt(away.score, 10);
  } else if (t.state === "in") {
    const halftime = t.name === "STATUS_HALFTIME" || (t.shortDetail || "").trim() === "HT";
    status = halftime ? "HT" : "LIVE";
    hs = parseInt(home.score, 10);
    as = parseInt(away.score, 10);
    if (!halftime) clock = (t.shortDetail || t.detail || "").trim() || null;
  } else {
    status = "NS";
  }

  const sideOf = {};
  for (const c of comp.competitors) if (c.team?.id) sideOf[c.team.id] = c.homeAway;
  const pname = (d) => d.athletesInvolved?.[0]?.shortName || d.athletesInvolved?.[0]?.displayName || "—";
  const goals = (comp.details || [])
    .filter((d) => d.scoringPlay && !d.shootout)
    .map((d) => ({ side: sideOf[d.team?.id] || null, player: pname(d), minute: d.clock?.displayValue || "", pen: !!d.penaltyKick, og: !!d.ownGoal }))
    .filter((g) => g.side);
  const cards = (comp.details || [])
    .filter((d) => d.yellowCard || d.redCard)
    .map((d) => ({ side: sideOf[d.team?.id] || null, player: pname(d), minute: d.clock?.displayValue || "", type: d.redCard ? "red" : "yellow" }))
    .filter((c) => c.side);

  const STAT_KEYS = ["possessionPct","totalShots","shotsOnTarget","saves","totalFouls","cornerKicks","offsides"];
  const statsFor = (statsArr) => {
    const out = {};
    for (const s of statsArr || []) if (STAT_KEYS.includes(s.name)) out[s.name] = s.displayValue;
    return Object.keys(out).length ? out : null;
  };
  const homeStats = statsFor(home.statistics);
  const awayStats = statsFor(away.statistics);

  // Group letter only when both teams share a group (i.e. group stage).
  const hk = key(home.team.displayName);
  const ak = key(away.team.displayName);
  const group = groupMap[hk] && groupMap[hk] === groupMap[ak] ? groupMap[hk] : null;
  const venue = comp.venue?.fullName
    ? comp.venue.fullName + (comp.venue.address?.city ? `, ${comp.venue.address.city}` : "")
    : "TBD";

  return {
    id: "e" + ev.id,
    date: ev.date,
    home: canon(home.team.displayName),
    away: canon(away.team.displayName),
    group,
    venue,
    homeScore: Number.isFinite(hs) ? hs : null,
    awayScore: Number.isFinite(as) ? as : null,
    status,
    clock,
    goals,
    cards,
    homeStats,
    awayStats,
  };
}

// Full tournament schedule from ESPN.
async function fetchFullSchedule() {
  const groupMap = await fetchGroups();
  const seen = new Map();
  for (const w of WINDOWS) {
    const data = await fetchUrl(`${ESPN_SCOREBOARD}?dates=${w}&limit=200`, true);
    for (const ev of data.events || []) {
      const m = extractMatch(ev, groupMap);
      if (m) seen.set(m.id, m);
    }
    console.log(`  • window ${w}: ${data.events?.length || 0} events`);
  }
  return [...seen.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Fallback: the 8 opening fixtures, with Wikipedia final scores merged in.
async function baselineFallback() {
  const matches = BASELINE.map((m) => ({ ...m, clock: null, goals: [], cards: [] }));
  try {
    const $ = cheerio.load(await fetchUrl(WIKI_URL));
    const wiki = new Map();
    $(".footballbox").each((_, el) => {
      const $b = $(el);
      const h = $b.find(".fhome").text().trim();
      const a = $b.find(".faway").text().trim();
      const s = parseScore($b.find(".fscore").text());
      if (h && a && s) wiki.set(pairKey(h, a), s);
    });
    for (const m of matches) {
      const s = wiki.get(pairKey(m.home, m.away));
      if (s) { m.homeScore = s[0]; m.awayScore = s[1]; m.status = "FT"; }
    }
  } catch (e) {
    console.warn(`  ⚠ Wikipedia fallback failed: ${e.message}`);
  }
  return matches;
}

async function main() {
  let matches = [];
  let source = "";

  try {
    console.log("→ Fetching full schedule from ESPN…");
    matches = await fetchFullSchedule();
    if (matches.length) {
      const played = matches.filter((m) => m.status === "FT" || m.status === "LIVE" || m.status === "HT").length;
      source = `ESPN full schedule + live · ${matches.length} matches · zero API tokens used`;
      console.log(`  ✓ ${matches.length} matches (${played} played/live)`);
    }
  } catch (e) {
    console.warn(`  ⚠ ESPN schedule failed: ${e.message}`);
    matches = [];
  }

  if (!matches.length) {
    console.log("→ Falling back to baseline + Wikipedia…");
    matches = await baselineFallback();
    source = "Baseline + Wikipedia (ESPN unavailable) · zero API tokens used";
  }

  const output = { matches, lastUpdated: new Date().toISOString(), source };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n✓ Wrote ${matches.length} matches to src/data/matches.json`);
  console.log(`✓ Last updated: ${output.lastUpdated}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
