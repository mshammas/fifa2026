#!/usr/bin/env node
/* ============================================================
   FIFA World Cup 2026 — squad roster fetcher (zero API tokens)

   Fetches all 48 team rosters from ESPN's public API and writes
   src/data/rosters.json.  Run once before the tournament or
   whenever squads change (injuries, late call-ups).
   ============================================================ */
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../src/data/rosters.json");

const ESPN_TEAMS = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams";
const ESPN_ROSTER = (id) => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/${id}/roster`;

const NAME_MAP = {
  "Bosnia-Herzegovina": "Bosnia & Herzegovina",
  "United States": "USA",
};
const canon = (name) => NAME_MAP[name?.trim()] ?? name?.trim() ?? "";

const POS_MAP = { G: "GK", D: "DEF", M: "MID", F: "FWD" };

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; fifa2026-bot)" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(fetchJson(res.headers.location));
      if (res.statusCode !== 200)
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve(JSON.parse(raw)));
    }).on("error", reject);
  });
}

async function main() {
  console.log("→ Fetching team list…");
  const teamsData = await fetchJson(ESPN_TEAMS);
  const espnTeams = teamsData.sports[0].leagues[0].teams.map((t) => ({
    id: t.team.id,
    name: canon(t.team.displayName),
  }));
  console.log(`  Found ${espnTeams.length} teams`);

  const rosters = {};
  let ok = 0, fail = 0;

  for (const { id, name } of espnTeams) {
    try {
      const data = await fetchJson(ESPN_ROSTER(id));
      rosters[name] = (data.athletes || []).map((a) => ({
        id: a.id,
        name: a.displayName,
        shortName: a.shortName,
        jersey: a.jersey != null ? Number(a.jersey) : null,
        pos: POS_MAP[a.position?.abbreviation] ?? a.position?.abbreviation ?? null,
        age: a.age ?? null,
        dob: a.dateOfBirth?.slice(0, 10) ?? null,
        height: a.displayHeight ?? null,
        weight: a.displayWeight ?? null,
      })).sort((a, b) => {
        const posOrder = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
        const pa = posOrder[a.pos] ?? 9, pb = posOrder[b.pos] ?? 9;
        if (pa !== pb) return pa - pb;
        return (a.jersey ?? 99) - (b.jersey ?? 99);
      });
      console.log(`  ✓ ${name} — ${rosters[name].length} players`);
      ok++;
    } catch (e) {
      console.warn(`  ✗ ${name}: ${e.message}`);
      fail++;
    }
    // Small delay to be polite to ESPN
    await new Promise((r) => setTimeout(r, 120));
  }

  const out = { lastUpdated: new Date().toISOString(), rosters };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n✅ Wrote ${OUT_PATH} (${ok} teams, ${fail} failed)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
