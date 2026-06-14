import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import matchesData from "./data/matches.json";

/* ============================================================
   FIFA World Cup 2026 — Live Scores (elder-friendly, zero-token)
   All data is imported statically from src/data/matches.json.
   No runtime fetch / API calls happen anywhere in this file.
   ============================================================ */

// Flag emojis for the teams in the tournament (falls back to ⚽).
const FLAGS = {
  Mexico: "🇲🇽", "South Africa": "🇿🇦", "South Korea": "🇰🇷", Czechia: "🇨🇿",
  Canada: "🇨🇦", "Bosnia & Herzegovina": "🇧🇦", USA: "🇺🇸", Paraguay: "🇵🇾",
  Qatar: "🇶🇦", Switzerland: "🇨🇭", Brazil: "🇧🇷", Morocco: "🇲🇦",
  Haiti: "🇭🇹", Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", Australia: "🇦🇺", "Türkiye": "🇹🇷",
  Argentina: "🇦🇷", France: "🇫🇷", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Spain: "🇪🇸",
  Germany: "🇩🇪", Portugal: "🇵🇹", Netherlands: "🇳🇱", Japan: "🇯🇵",
  Croatia: "🇭🇷", Belgium: "🇧🇪", Uruguay: "🇺🇾", Colombia: "🇨🇴",
  Ecuador: "🇪🇨", "Ivory Coast": "🇨🇮", "Curaçao": "🇨🇼", Sweden: "🇸🇪",
  Tunisia: "🇹🇳", Iran: "🇮🇷", Egypt: "🇪🇬", "New Zealand": "🇳🇿",
  "Saudi Arabia": "🇸🇦", "Cape Verde": "🇨🇻", Norway: "🇳🇴", Senegal: "🇸🇳",
  Iraq: "🇮🇶", Austria: "🇦🇹", Algeria: "🇩🇿", Jordan: "🇯🇴",
  Uzbekistan: "🇺🇿", "Congo DR": "🇨🇩", Panama: "🇵🇦", Ghana: "🇬🇭",
};
const flag = (team) => FLAGS[team] || "⚽";

// Timezones offered in the picker. "local" resolves to the viewer's device tz.
const TIMEZONES = [
  { value: "local", label: "📍 My Local Time" },
  { value: "America/New_York", label: "🇺🇸 New York (ET)" },
  { value: "America/Chicago", label: "🇺🇸 Chicago (CT)" },
  { value: "America/Denver", label: "🇺🇸 Denver (MT)" },
  { value: "America/Los_Angeles", label: "🇺🇸 Los Angeles (PT)" },
  { value: "America/Mexico_City", label: "🇲🇽 Mexico City" },
  { value: "America/Toronto", label: "🇨🇦 Toronto" },
  { value: "Europe/London", label: "🇬🇧 London (UK)" },
  { value: "Europe/Paris", label: "🇪🇺 Paris (CET)" },
  { value: "Asia/Dubai", label: "🇦🇪 Dubai (GST)" },
  { value: "Asia/Kolkata", label: "🇮🇳 India (IST)" },
  { value: "Asia/Singapore", label: "🇸🇬 Singapore" },
  { value: "Australia/Sydney", label: "🇦🇺 Sydney" },
];

// Where the family can watch — public broadcaster links (no auth, no tokens).
const WATCH_PROVIDERS = [
  { name: "FOX Sports", note: "English (USA)", url: "https://www.foxsports.com/soccer/fifa-world-cup" },
  { name: "Telemundo", note: "Español (USA)", url: "https://www.telemundodeportes.com/futbol/copa-mundial" },
  { name: "Tubi", note: "Free stream (USA)", url: "https://tubitv.com/" },
  { name: "FIFA+", note: "Worldwide", url: "https://www.plus.fifa.com/" },
];

const STATUS = {
  LIVE: { label: "LIVE", color: "#ef4444", bg: "rgba(239,68,68,0.15)", live: true },
  HT: { label: "Half Time", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  FT: { label: "Full Time", color: "#94a3b8", bg: "rgba(148,163,184,0.15)" },
  NS: { label: "Upcoming", color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
};

/* ----------------------------- helpers ----------------------------- */

const tzArg = (tz) => (tz === "local" ? undefined : tz);

function fmt(iso, tz, opts) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tzArg(tz), ...opts }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso));
  }
}

const timeLabel = (iso, tz) => fmt(iso, tz, { hour: "numeric", minute: "2-digit" });
const dayHeader = (iso, tz) => fmt(iso, tz, { weekday: "long", month: "long", day: "numeric" });

// Sortable YYYY-MM-DD key for the *viewer's* chosen timezone.
function dateKey(iso, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tzArg(tz), year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// Compute group standings purely from played matches (FT or LIVE with scores).
function computeStandings(matches) {
  const groups = {};
  for (const m of matches) {
    if (!m.group) continue;
    (groups[m.group] ||= {});
    for (const team of [m.home, m.away]) {
      groups[m.group][team] ||= { team, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
    }
    const played =
      (m.status === "FT" || m.status === "LIVE" || m.status === "HT") &&
      m.homeScore != null && m.awayScore != null;
    if (!played) continue;
    const h = groups[m.group][m.home];
    const a = groups[m.group][m.away];
    h.P++; a.P++;
    h.GF += m.homeScore; h.GA += m.awayScore;
    a.GF += m.awayScore; a.GA += m.homeScore;
    if (m.homeScore > m.awayScore) { h.W++; a.L++; h.Pts += 3; }
    else if (m.homeScore < m.awayScore) { a.W++; h.L++; a.Pts += 3; }
    else { h.D++; a.D++; h.Pts++; a.Pts++; }
  }
  const out = {};
  for (const g of Object.keys(groups).sort()) {
    const rows = Object.values(groups[g]);
    rows.forEach((r) => (r.GD = r.GF - r.GA));
    rows.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF || x.team.localeCompare(y.team));
    out[g] = rows;
  }
  return out;
}

/* ----------------------------- styles ------------------------------ */

const C = {
  bg: "#0e0e14", card: "#16161e", card2: "#1a1a24", border: "#2a2a38",
  text: "#ffffff", dim: "#9aa0b4", green: "#22c55e", red: "#ef4444", gold: "#fbbf24",
};

function GlobalStyles() {
  return (
    <style>{`
      :root { color-scheme: dark; }
      html { -webkit-text-size-adjust: 100%; }
      body { font-size: 18px; line-height: 1.5; }
      button { font-family: inherit; cursor: pointer; }
      select { font-family: inherit; }
      a { color: ${C.green}; }
      .wc-tab:hover { background: ${C.card2} !important; }
      .wc-card { transition: transform .12s ease, box-shadow .12s ease; }
      .wc-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
      .wc-btn:hover { filter: brightness(1.12); }
      .wc-live { animation: wcPulse 1.4s ease-in-out infinite; }
      @keyframes wcPulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
      .wc-wrap { max-width: 860px; margin: 0 auto; }
      @media (max-width: 640px) {
        body { font-size: 17px; }
        .wc-hide-sm { display: none !important; }
      }
    `}</style>
  );
}

/* --------------------------- components ---------------------------- */

function Header({ lastUpdated, tz }) {
  return (
    <header style={{ textAlign: "center", padding: "8px 0 4px" }}>
      <div style={{ fontSize: 40 }}>⚽</div>
      <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.5, margin: "4px 0" }}>
        FIFA World Cup 2026
      </h1>
      <p style={{ color: C.dim, fontSize: 16, margin: 0 }}>
        Live scores · USA · Canada · Mexico
      </p>
      {lastUpdated && (
        <p style={{ color: C.dim, fontSize: 14, marginTop: 6 }}>
          Updated {fmt(lastUpdated, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </header>
  );
}

function Controls({ tz, setTz }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "16px 0" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        <span style={{ fontSize: 16, color: C.dim, whiteSpace: "nowrap" }}>🕒 Show times in</span>
        <select
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          style={{
            flex: 1, fontSize: 17, fontWeight: 700, color: C.text, background: C.card,
            border: `2px solid ${C.border}`, borderRadius: 10, padding: "12px 10px",
          }}
        >
          {TIMEZONES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Tabs({ tab, setTab }) {
  const items = [
    { id: "matches", label: "📅 Matches" },
    { id: "schedule", label: "🗓️ Schedule" },
    { id: "standings", label: "📊 Standings" },
    { id: "highlights", label: "🎬 Highlights" },
    { id: "watch", label: "📺 Watch" },
  ];
  return (
    <div
      role="tablist"
      style={{
        display: "flex", flexWrap: "wrap", gap: 6, background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: 6, marginBottom: 18,
      }}
    >
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={active}
            className="wc-tab"
            onClick={() => setTab(it.id)}
            style={{
              flex: "1 1 auto", fontSize: 15, fontWeight: 800, padding: "11px 10px",
              borderRadius: 10, border: "none", whiteSpace: "nowrap",
              color: active ? "#06210f" : C.text,
              background: active ? C.green : "transparent",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusBadge({ status, clock }) {
  const s = STATUS[status] || STATUS.NS;
  return (
    <span
      className={s.live ? "wc-live" : undefined}
      style={{
        fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: s.color,
        background: s.bg, borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap",
      }}
    >
      {s.live ? "🔴 " : ""}{s.label}{s.live && clock ? ` ${clock}` : ""}
    </span>
  );
}

function TeamRow({ team, score, winner }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>{flag(team)}</span>
        <span style={{
          fontSize: 20, fontWeight: winner ? 900 : 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {team}
        </span>
      </span>
      <span style={{ fontSize: 26, fontWeight: 900, color: winner ? C.gold : C.text }}>
        {score == null ? "–" : score}
      </span>
    </div>
  );
}

function MatchCard({ m, tz }) {
  const hasScore = m.homeScore != null && m.awayScore != null;
  const homeWin = hasScore && m.status === "FT" && m.homeScore > m.awayScore;
  const awayWin = hasScore && m.status === "FT" && m.awayScore > m.homeScore;
  return (
    <div
      className="wc-card"
      style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 16, marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.dim }}>Group {m.group}</span>
        <StatusBadge status={m.status} clock={m.clock} />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <TeamRow team={m.home} score={hasScore ? m.homeScore : null} winner={homeWin} />
        <TeamRow team={m.away} score={hasScore ? m.awayScore : null} winner={awayWin} />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          📍 {m.venue}
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, color: m.status === "NS" ? C.green : C.dim, whiteSpace: "nowrap" }}>
          {m.status === "NS" ? `⏰ ${timeLabel(m.date, tz)}` : timeLabel(m.date, tz)}
        </span>
      </div>
    </div>
  );
}

// Goals + cards breakdown for a match. Shared by live and result cards.
// Renders nothing when there's no goal/card data yet.
function MatchEvents({ m }) {
  const goals = m.goals || [];
  const cards = m.cards || [];
  if (!goals.length && !cards.length) return null;
  const homeGoals = goals.filter((g) => g.side === "home");
  const awayGoals = goals.filter((g) => g.side === "away");
  const homeCards = cards.filter((c) => c.side === "home");
  const awayCards = cards.filter((c) => c.side === "away");
  const fmtGoal = (g) => `${g.player} ${g.minute}${g.pen ? " (P)" : ""}${g.og ? " (OG)" : ""}`;
  const fmtCard = (c) => `${c.type === "red" ? "🟥" : "🟨"} ${c.player} ${c.minute}`;
  return (
    <>
      {goals.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>⚽ Goals</div>
          <div style={{ display: "grid", gap: 6, fontSize: 15 }}>
            <div><span style={{ marginRight: 6 }}>{flag(m.home)}</span><b>{m.home}:</b> {homeGoals.length ? homeGoals.map(fmtGoal).join(", ") : "—"}</div>
            <div><span style={{ marginRight: 6 }}>{flag(m.away)}</span><b>{m.away}:</b> {awayGoals.length ? awayGoals.map(fmtGoal).join(", ") : "—"}</div>
          </div>
        </div>
      )}
      {cards.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>🟨🟥 Cards</div>
          <div style={{ display: "grid", gap: 6, fontSize: 15 }}>
            {homeCards.length > 0 && (
              <div><span style={{ marginRight: 6 }}>{flag(m.home)}</span><b>{m.home}:</b> {homeCards.map(fmtCard).join(", ")}</div>
            )}
            {awayCards.length > 0 && (
              <div><span style={{ marginRight: 6 }}>{flag(m.away)}</span><b>{m.away}:</b> {awayCards.map(fmtCard).join(", ")}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Full live-match card: score, live minute, goals/cards so far, and a watch link.
function LiveCard({ m, tz }) {
  const hasScore = m.homeScore != null && m.awayScore != null;
  const watchQuery = encodeURIComponent(`${m.home} vs ${m.away} live`);
  return (
    <div className="wc-card" style={{ background: C.card, border: "1px solid rgba(239,68,68,0.45)", borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.dim }}>Group {m.group}</span>
        <StatusBadge status={m.status} clock={m.clock} />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <TeamRow team={m.home} score={hasScore ? m.homeScore : null} winner={false} />
        <TeamRow team={m.away} score={hasScore ? m.awayScore : null} winner={false} />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12, display: "grid", gap: 12, textAlign: "center" }}>
        <MatchEvents m={m} />
        <div style={{ fontSize: 14, color: C.dim }}>📍 {m.venue}</div>
        <a
          className="wc-btn"
          href={`https://www.google.com/search?q=${watchQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ justifySelf: "center", fontSize: 14, fontWeight: 800, color: "#06210f", background: C.green, borderRadius: 10, padding: "9px 14px", textDecoration: "none" }}
        >
          ▶ Watch Live
        </a>
      </div>
    </div>
  );
}

// Compact, collapsible card for finished matches: score + time when closed;
// tap to reveal goal scorers, cards, venue, and a highlights link.
function ResultCard({ m, tz }) {
  const [open, setOpen] = useState(false);
  const homeWin = m.homeScore > m.awayScore;
  const awayWin = m.awayScore > m.homeScore;
  const hlQuery = encodeURIComponent(`${m.home} vs ${m.away} World Cup 2026 highlights`);

  const teamLine = (team, score, win) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>{flag(team)}</span>
        <span style={{ fontSize: 17, fontWeight: win ? 900 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team}</span>
      </span>
      <span style={{ fontSize: 22, fontWeight: 900, color: win ? C.gold : C.text }}>{score}</span>
    </div>
  );

  return (
    <div
      className="wc-card"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 8, cursor: "pointer" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.dim }}>Group {m.group} · FT</span>
        <span style={{ fontSize: 13, color: C.dim }}>{timeLabel(m.date, tz)}</span>
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        {teamLine(m.home, m.homeScore, homeWin)}
        {teamLine(m.away, m.awayScore, awayWin)}
      </div>

      <div style={{ textAlign: "center", fontSize: 12, color: C.dim, marginTop: 6 }}>
        {open ? "▲ Hide details" : "▼ Tap for goals & details"}
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 10, display: "grid", gap: 12, textAlign: "center" }}>
          <MatchEvents m={m} />
          <div style={{ fontSize: 14, color: C.dim }}>📍 {m.venue}</div>
          <a
            className="wc-btn"
            href={`https://www.youtube.com/results?search_query=${hlQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ justifySelf: "center", fontSize: 14, fontWeight: 800, color: "#fff", background: "#ff0033", borderRadius: 10, padding: "9px 14px", textDecoration: "none" }}
          >
            ▶ Watch highlights
          </a>
        </div>
      )}
    </div>
  );
}

// Group filter chips (All + each group present in the data).
function GroupChips({ groups, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {groups.map((g) => {
        const active = value === g;
        return (
          <button
            key={g}
            className="wc-btn"
            onClick={() => onChange(g)}
            style={{
              fontSize: 15, fontWeight: 800, padding: "8px 14px", borderRadius: 999,
              border: `2px solid ${active ? C.green : C.border}`,
              color: active ? "#06210f" : C.text,
              background: active ? C.green : C.card,
            }}
          >
            {g === "All" ? "All" : `Group ${g}`}
          </button>
        );
      })}
    </div>
  );
}

// One compact row in the full Schedule list (works for any status).
function ScheduleRow({ m, tz }) {
  const s = STATUS[m.status] || STATUS.NS;
  const hasScore = m.homeScore != null && m.awayScore != null;
  const teamCell = (team) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 18 }}>{flag(team)}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{team}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
      <div style={{ minWidth: 0, display: "grid", gap: 3 }}>
        {teamCell(m.home)}
        {teamCell(m.away)}
      </div>
      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {hasScore ? (
          <div style={{ fontSize: 18, fontWeight: 900 }}>{m.homeScore}<span style={{ color: C.dim }}>–</span>{m.awayScore}</div>
        ) : (
          <div style={{ fontSize: 15, fontWeight: 800, color: C.green }}>{timeLabel(m.date, tz)}</div>
        )}
        <div className={s.live ? "wc-live" : undefined} style={{ fontSize: 11, fontWeight: 800, color: s.color, marginTop: 2 }}>
          {s.live ? "🔴 " : ""}{m.status === "NS" ? (m.group ? `Group ${m.group}` : "Knockout") : s.label}
        </div>
      </div>
    </div>
  );
}

// Full tournament schedule: every fixture, grouped by day (soonest first).
function ScheduleTab({ matches, tz }) {
  const groups = useMemo(
    () => ["All", ...Array.from(new Set(matches.map((m) => m.group).filter(Boolean))).sort()],
    [matches]
  );
  const [groupFilter, setGroupFilter] = useState("All");
  const filtered = matches.filter((m) => groupFilter === "All" || m.group === groupFilter);
  const sorted = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));

  const sections = [];
  let cur = null;
  for (const m of sorted) {
    const k = dateKey(m.date, tz);
    if (k !== cur) { cur = k; sections.push({ key: k, label: dayHeader(m.date, tz), items: [] }); }
    sections[sections.length - 1].items.push(m);
  }

  return (
    <div>
      <GroupChips groups={groups} value={groupFilter} onChange={setGroupFilter} />
      {sections.length === 0 && <EmptyState emoji="🗓️" text="No matches to show." />}
      {sections.map((sec) => (
        <section key={sec.key} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.gold, margin: "0 0 8px" }}>{sec.label}</h3>
          {sec.items.map((m) => (
            <ScheduleRow key={m.id} m={m} tz={tz} />
          ))}
        </section>
      ))}
    </div>
  );
}

function MatchesTab({ matches, tz }) {
  const groups = useMemo(() => ["All", ...Array.from(new Set(matches.map((m) => m.group).filter(Boolean))).sort()], [matches]);
  const [groupFilter, setGroupFilter] = useState("All");

  const filtered = matches.filter((m) => groupFilter === "All" || m.group === groupFilter);

  const isLive = (m) => m.status === "LIVE" || m.status === "HT";

  // Group a list of matches into day sections in the chosen timezone, either
  // oldest-first (upcoming fixtures) or newest-first (finished results).
  const daySections = (list, newestFirst) => {
    const arr = [...list].sort((a, b) =>
      newestFirst ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date)
    );
    const out = [];
    let key = null;
    for (const m of arr) {
      const k = dateKey(m.date, tz);
      if (k !== key) { key = k; out.push({ key: k, label: dayHeader(m.date, tz), items: [] }); }
      out[out.length - 1].items.push(m);
    }
    return out;
  };

  // Three buckets: live now, finished results (latest first), upcoming (soonest first).
  const liveMatches = [...filtered].filter(isLive).sort((a, b) => new Date(a.date) - new Date(b.date));
  const resultSections = daySections(filtered.filter((m) => m.status === "FT"), true);
  const upcomingSections = daySections(filtered.filter((m) => !isLive(m) && m.status !== "FT"), false);
  const isEmpty = !liveMatches.length && !resultSections.length && !upcomingSections.length;

  return (
    <div>
      <GroupChips groups={groups} value={groupFilter} onChange={setGroupFilter} />

      {isEmpty && (
        <EmptyState emoji="📭" text="No matches to show yet." />
      )}

      {liveMatches.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.red, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="wc-live">🔴</span> Live Now
          </h2>
          {liveMatches.map((m) => (
            <LiveCard key={m.id} m={m} tz={tz} />
          ))}
        </section>
      )}

      {resultSections.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.gold, margin: "0 0 14px" }}>✅ Results</h2>
          {resultSections.map((sec) => (
            <section key={sec.key} style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: C.dim, margin: "0 0 10px" }}>{sec.label}</h3>
              {sec.items.map((m) => (
                <ResultCard key={m.id} m={m} tz={tz} />
              ))}
            </section>
          ))}
        </div>
      )}

      {upcomingSections.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.green, margin: "0 0 14px" }}>📅 Upcoming</h2>
          {upcomingSections.map((sec) => (
            <section key={sec.key} style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: C.dim, margin: "0 0 10px" }}>{sec.label}</h3>
              {sec.items.map((m) => (
                <MatchCard key={m.id} m={m} tz={tz} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function StandingsTab({ matches }) {
  const standings = useMemo(() => computeStandings(matches), [matches]);
  const groups = Object.keys(standings);
  const anyPlayed = matches.some(
    (m) => (m.status === "FT" || m.status === "LIVE" || m.status === "HT") && m.homeScore != null
  );

  if (!anyPlayed) {
    return <EmptyState emoji="📊" text="Standings will appear here once matches are played." />;
  }

  const cell = { padding: "10px 8px", textAlign: "center", fontSize: 16, fontWeight: 700 };
  const head = { ...cell, fontSize: 13, color: C.dim, fontWeight: 800 };

  return (
    <div>
      {groups.map((g) => (
        <section key={g} style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 19, fontWeight: 900, color: C.gold, margin: "0 0 10px" }}>Group {g}</h2>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.card2 }}>
                  <th style={{ ...head, textAlign: "left", paddingLeft: 14 }}>Team</th>
                  <th style={head}>P</th>
                  <th style={head} className="wc-hide-sm">W</th>
                  <th style={head} className="wc-hide-sm">D</th>
                  <th style={head} className="wc-hide-sm">L</th>
                  <th style={head}>GD</th>
                  <th style={{ ...head, color: C.green }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings[g].map((r, i) => (
                  <tr key={r.team} style={{ borderTop: `1px solid ${C.border}`, background: i < 2 ? "rgba(34,197,94,0.06)" : "transparent" }}>
                    <td style={{ ...cell, textAlign: "left", paddingLeft: 14 }}>
                      <span style={{ marginRight: 8 }}>{flag(r.team)}</span>
                      {r.team}
                    </td>
                    <td style={cell}>{r.P}</td>
                    <td style={cell} className="wc-hide-sm">{r.W}</td>
                    <td style={cell} className="wc-hide-sm">{r.D}</td>
                    <td style={cell} className="wc-hide-sm">{r.L}</td>
                    <td style={cell}>{r.GD > 0 ? `+${r.GD}` : r.GD}</td>
                    <td style={{ ...cell, color: C.green, fontWeight: 900 }}>{r.Pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 13, color: C.dim, margin: "8px 2px 0" }}>
            Top 2 (highlighted) advance · P=Played W=Won D=Draw L=Lost GD=Goal diff
          </p>
        </section>
      ))}
    </div>
  );
}

function HighlightsTab({ matches, tz }) {
  const finished = matches
    .filter((m) => m.status === "FT" && m.homeScore != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (finished.length === 0) {
    return <EmptyState emoji="🎬" text="Match highlights will appear here after the first games finish." />;
  }

  return (
    <div>
      {finished.map((m) => {
        const q = encodeURIComponent(`${m.home} vs ${m.away} World Cup 2026 highlights`);
        const homeWin = m.homeScore > m.awayScore;
        const awayWin = m.awayScore > m.homeScore;
        return (
          <div key={m.id} className="wc-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 19, fontWeight: 800 }}>
                <span style={{ marginRight: 6 }}>{flag(m.home)}</span>
                <span style={{ color: homeWin ? C.gold : C.text }}>{m.home} {m.homeScore}</span>
                <span style={{ color: C.dim, margin: "0 8px" }}>–</span>
                <span style={{ color: awayWin ? C.gold : C.text }}>{m.awayScore} {m.away}</span>
                <span style={{ marginLeft: 6 }}>{flag(m.away)}</span>
              </div>
              <a
                className="wc-btn"
                href={`https://www.youtube.com/results?search_query=${q}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 15, fontWeight: 800, color: "#fff", background: "#ff0033",
                  borderRadius: 10, padding: "10px 16px", textDecoration: "none", whiteSpace: "nowrap",
                }}
              >
                ▶ Watch highlights
              </a>
            </div>
            <div style={{ fontSize: 14, color: C.dim, marginTop: 8 }}>
              Group {m.group} · {dayHeader(m.date, tz)} · 📍 {m.venue}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WatchTab() {
  return (
    <div>
      <p style={{ fontSize: 17, color: C.dim, margin: "0 0 16px" }}>
        Pick a broadcaster below. Links open in a new tab — availability depends on your country.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        {WATCH_PROVIDERS.map((p) => (
          <a
            key={p.name}
            className="wc-card"
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: "18px 18px", textDecoration: "none", color: C.text,
            }}
          >
            <span>
              <span style={{ fontSize: 20, fontWeight: 900, display: "block" }}>📺 {p.name}</span>
              <span style={{ fontSize: 15, color: C.dim }}>{p.note}</span>
            </span>
            <span style={{ fontSize: 20, color: C.green }}>→</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ emoji, text }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px", color: C.dim }}>
      <div style={{ fontSize: 44, marginBottom: 10 }}>{emoji}</div>
      <p style={{ fontSize: 18, margin: 0 }}>{text}</p>
    </div>
  );
}

function Footer({ source }) {
  return (
    <footer style={{ textAlign: "center", color: C.dim, fontSize: 13, padding: "28px 0 12px", lineHeight: 1.7 }}>
      <div>{source || "Static data · zero API tokens used"}</div>
      <div>Built by Shammas Oliyath · fifa.shammas.in</div>
    </footer>
  );
}

/* ------------------------------ App -------------------------------- */

export default function App() {
  const [tab, setTab] = useState("matches");
  const [tz, setTz] = useState("local");
  const matches = matchesData.matches || [];

  // "Refresh" just reloads the page to pick up the latest published build.
  // There is no API call — data is baked in at build time.
  const onRefresh = () => window.location.reload();

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "16px 16px 0" }}>
      <GlobalStyles />
      <div className="wc-wrap">
        <Header lastUpdated={matchesData.lastUpdated} tz={tz} />
        <Controls tz={tz} setTz={setTz} />
        <Tabs tab={tab} setTab={setTab} />

        {matches.length === 0 ? (
          <EmptyState emoji="📭" text="No match data found. Run the scraper to populate scores." />
        ) : tab === "matches" ? (
          <MatchesTab matches={matches} tz={tz} />
        ) : tab === "schedule" ? (
          <ScheduleTab matches={matches} tz={tz} />
        ) : tab === "standings" ? (
          <StandingsTab matches={matches} />
        ) : tab === "highlights" ? (
          <HighlightsTab matches={matches} tz={tz} />
        ) : (
          <WatchTab />
        )}

        <Footer source={matchesData.source} />
      </div>

      {/* Floating quick-refresh — handy when scrolled deep into the schedule. */}
      <button
        onClick={onRefresh}
        aria-label="Refresh scores"
        title="Refresh"
        className="wc-btn"
        style={{
          position: "fixed", right: 18, bottom: 18, width: 56, height: 56, borderRadius: "50%",
          border: "none", background: C.green, color: "#06210f", fontSize: 26, fontWeight: 900,
          boxShadow: "0 6px 22px rgba(0,0,0,0.55)", cursor: "pointer", zIndex: 50, lineHeight: 1,
        }}
      >
        ↻
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
