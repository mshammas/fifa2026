#!/usr/bin/env node
/* ============================================================
   Gate for the scraper: only do work while a match is in progress.

   "In progress" is driven by ESPN's status (as last committed in
   matches.json), NOT by a 90-minute timer — so stoppage time, extra time and
   penalty shootouts are all covered: a match stays active until ESPN reports
   it Full Time.

     LIVE / HT              -> active (until ESPN flips it to FT)
     NS and kickoff passed  -> active (match should have started)
     FT                     -> not active
     > 4h after kickoff     -> not active (failsafe against a stuck status)

   Writes `active=true|false` to $GITHUB_OUTPUT for the workflow to branch on.
   Fails open (active=true) if the data can't be read.
   ============================================================ */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "../src/data/matches.json");
const LEAD_MS = 2 * 60 * 1000;          // begin a touch before kickoff
const FAILSAFE_MS = 4 * 60 * 60 * 1000; // nothing is "in progress" 4h after kickoff

function isActive(m, now) {
  if (m.status === "FT") return false;
  const ko = new Date(m.date).getTime();
  if (!Number.isFinite(ko)) return false;
  if (now > ko + FAILSAFE_MS) return false;
  if (m.status === "LIVE" || m.status === "HT") return true;
  if (m.status === "NS" && now >= ko - LEAD_MS) return true;
  return false;
}

let active = true; // fail open
try {
  const { matches } = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const now = Date.now();
  const live = matches.filter((m) => isActive(m, now));
  active = live.length > 0;
  console.log(
    active
      ? `✅ ${live.length} match(es) in progress — refreshing: ${live.map((m) => `${m.home} v ${m.away}`).join(", ")}`
      : "💤 No match in progress — skipping this run."
  );
} catch (e) {
  console.warn(`⚠ Could not read matches.json (${e.message}) — running to be safe.`);
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `active=${active}\n`);
}
