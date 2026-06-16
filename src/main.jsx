import React, { useState, useMemo, useEffect, useCallback } from "react";
import ReactDOM from "react-dom/client";
import matchesData from "./data/matches.json";
import rostersData from "./data/rosters.json";

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

function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? init; } catch { return init; }
  });
  const save = (v) => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  };
  return [val, save];
}

// Shared "now" hook — updates every 30 s (enough for countdowns).
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useScoreFlash(score) {
  const [flash, setFlash] = useState(false);
  const prev = React.useRef(score);
  useEffect(() => {
    if (score != null && prev.current != null && prev.current !== score) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      prev.current = score;
      return () => clearTimeout(t);
    }
    prev.current = score;
  }, [score]);
  return flash;
}

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

// Google Calendar pre-fill URL for an upcoming fixture.
function calendarUrl(m) {
  const start = new Date(m.date);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const title = `${flag(m.home)} ${m.home} vs ${m.away} ${flag(m.away)} — FIFA World Cup 2026`;
  const details = [m.group ? `Group ${m.group}` : "Knockout", m.venue].filter(Boolean).join(" · ");
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${fmt(start)}/${fmt(end)}` +
    `&details=${encodeURIComponent(details)}` +
    `&location=${encodeURIComponent(m.venue || "")}`
  );
}

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
      html { -webkit-text-size-adjust: 100%; overflow-y: auto; overscroll-behavior-y: none; }
      body { font-size: 18px; line-height: 1.5; overflow: visible; overscroll-behavior-y: none; padding-top: env(safe-area-inset-top, 0px); padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px)); }
      .wc-sticky { position: -webkit-sticky; position: sticky; top: 0; top: env(safe-area-inset-top, 0px); z-index: 10; }
      button { font-family: inherit; cursor: pointer; }
      select { font-family: inherit; }
      a { color: ${C.green}; }
      .wc-tab-active { color: ${C.green} !important; }
      .wc-tab:not(.wc-tab-active):hover { opacity: 0.75; }
      .wc-card { transition: transform .12s ease, box-shadow .12s ease; }
      .wc-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
      .wc-btn:hover { filter: brightness(1.12); }
      .wc-live { animation: wcPulse 1.4s ease-in-out infinite; }
      @keyframes wcPulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
      .wc-wrap { max-width: 860px; margin: 0 auto; }
      .wc-ptr-spinner { animation: wcSpin 0.7s linear infinite; }
      @keyframes wcSpin { to { transform: rotate(360deg); } }
      .wc-slide-left  { animation: wcSlideLeft  0.22s ease both; }
      .wc-slide-right { animation: wcSlideRight 0.22s ease both; }
      @keyframes wcSlideLeft  { from { opacity: 0; transform: translateX(32px);  } to { opacity: 1; transform: translateX(0); } }
      @keyframes wcSlideRight { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: translateX(0); } }
      @media (max-width: 640px) {
        body { font-size: 17px; }
        .wc-hide-sm { display: none !important; }
      }
      @keyframes wcFabPop {
        from { transform: scale(0.4) translateY(8px); opacity: 0; }
        to   { transform: scale(1)   translateY(0);   opacity: 1; }
      }
      @keyframes wcTicker {
        0%   { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
      .wc-ticker { animation: wcTicker 18s linear infinite; display: inline-block; }
      .wc-ticker:hover { animation-play-state: paused; }
      @keyframes wcScoreFlash { 0% { color: ${C.green}; transform: scale(1.35); } 100% { color: inherit; transform: scale(1); } }
      .wc-score-flash { animation: wcScoreFlash 0.65s ease; }
      .wc-noscroll { scrollbar-width: none; -ms-overflow-style: none; }
      .wc-noscroll::-webkit-scrollbar { display: none; }
    `}</style>
  );
}

/* --------------------------- components ---------------------------- */

// Timezone control as a compact popover button (reclaims the old full-width row).
function TimezonePopover({ tz, setTz }) {
  const [open, setOpen] = useState(false);
  const current = TIMEZONES.find((t) => t.value === tz) || TIMEZONES[0];
  const short = current.label.replace(/^\S+\s/, "");
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        className="wc-btn"
        aria-label="Change timezone"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: C.text, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
      >
        🕒<span className="wc-hide-sm">{short}</span>▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 61, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 6, width: 230, maxHeight: 320, overflowY: "auto", boxShadow: "0 12px 32px rgba(0,0,0,0.55)" }}>
            {TIMEZONES.map((t) => {
              const sel = t.value === tz;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setTz(t.value); setOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", fontSize: 15, fontWeight: sel ? 800 : 600, color: sel ? C.green : C.text, background: sel ? "rgba(34,197,94,0.12)" : "transparent", border: "none", borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Header({ lastUpdated, tz, setTz, onSettings, notifOn }) {
  const [shareDone, setShareDone] = useState(false);
  const handleShareApp = async () => {
    const url = "https://fifa.shammas.in";
    const text = "Follow FIFA World Cup 2026 live — goals, scores & stats updated every 5 min.";
    if (navigator.share) {
      try { await navigator.share({ title: "FIFA World Cup 2026 Live", text, url }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareDone(true);
      setTimeout(() => setShareDone(false), 2000);
    } catch {}
  };
  return (
    <header style={{ padding: "6px 0 4px" }}>
      <h1 style={{ fontSize: 21, fontWeight: 900, letterSpacing: -0.3, margin: "0 0 5px", whiteSpace: "nowrap" }}>
        ⚽ FIFA World Cup 2026
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {(() => {
          const text = lastUpdated
            ? `Live scores · Scores fetched ${fmt(lastUpdated, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
            : "Live scores";
          return (
            <div style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
              <span className="wc-ticker" style={{ color: C.dim, fontSize: 13, whiteSpace: "nowrap" }}>
                {text}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;{text}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;
              </span>
            </div>
          );
        })()}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            onClick={handleShareApp}
            title={shareDone ? "Link copied!" : "Share app"}
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: shareDone ? C.green : C.dim, fontSize: 16, padding: "5px 8px", cursor: "pointer", lineHeight: 1, transition: "color 0.2s" }}
          >
            {shareDone ? "✓" : "🔗"}
          </button>
          <button
            onClick={onSettings}
            title="Notification settings"
            style={{ background: notifOn ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)", border: notifOn ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: notifOn ? C.green : C.dim, fontSize: 16, padding: "5px 8px", cursor: "pointer", lineHeight: 1 }}
          >
            🔔
          </button>
          <TimezonePopover tz={tz} setTz={setTz} />
        </div>
      </div>
    </header>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function SettingsPanel({ onClose }) {
  const [permission, setPermission] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [notifOn, setNotifOn] = useLocalStorage("wc_notif_on", false);
  const [notifGoals, setNotifGoals] = useLocalStorage("wc_notif_goals", true);
  const [notifKickoff, setNotifKickoff] = useLocalStorage("wc_notif_kickoff", true);
  const [notifFT, setNotifFT] = useLocalStorage("wc_notif_ft", true);
  const [notifCards, setNotifCards] = useLocalStorage("wc_notif_cards", false);
  const [notifFavOnly, setNotifFavOnly] = useLocalStorage("wc_notif_favonly", false);

  const toggle = async () => {
    if (notifOn) { setNotifOn(false); return; }
    if (typeof Notification === "undefined") { alert("Notifications not supported in this browser."); return; }
    if (permission === "denied") { alert("Notifications are blocked. Please enable them in your browser settings, then try again."); return; }
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm === "granted") {
      setNotifOn(true);
      new Notification("⚽ Notifications enabled!", { body: "You'll get updates for goals, kick-offs and more.", icon: "./apple-touch-icon.png" });
    }
  };

  const Row = ({ label, value, onChange, disabled }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: disabled ? C.dim : C.text }}>{label}</span>
      <button
        onClick={() => !disabled && onChange(!value)}
        style={{
          width: 48, height: 26, borderRadius: 13, border: "none", cursor: disabled ? "default" : "pointer",
          background: value && !disabled ? C.green : C.border,
          position: "relative", transition: "background 0.2s", flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: value && !disabled ? 25 : 3,
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", display: "block",
        }} />
      </button>
    </div>
  );

  const blocked = permission === "denied";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: C.card2, borderRadius: "20px 20px 0 0", padding: "20px 20px 36px", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>🔔 Notifications</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.dim, fontSize: 22, cursor: "pointer", padding: 4 }}>✕</button>
        </div>

        {blocked && (
          <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.red, marginBottom: 16 }}>
            Notifications are blocked in your browser. Enable them in site settings, then return here.
          </div>
        )}

        <p style={{ fontSize: 13, color: C.dim, margin: "0 0 16px", lineHeight: 1.6 }}>
          Notifications fire when the app is open and scores refresh. You'll be alerted for goals, kick-offs and more.
        </p>

        <Row label="Enable notifications" value={notifOn} onChange={toggle} disabled={blocked} />
        <div style={{ paddingLeft: 8, opacity: notifOn ? 1 : 0.4, pointerEvents: notifOn ? "auto" : "none" }}>
          <Row label="⚽ Goals" value={notifGoals} onChange={setNotifGoals} />
          <Row label="🟢 Kick-off alerts" value={notifKickoff} onChange={setNotifKickoff} />
          <Row label="✅ Full time" value={notifFT} onChange={setNotifFT} />
          <Row label="🟥 Red cards" value={notifCards} onChange={setNotifCards} />
          <Row label="⭐ Favourite team only" value={notifFavOnly} onChange={setNotifFavOnly} />
        </div>

        <p style={{ fontSize: 12, color: C.dim, marginTop: 16, lineHeight: 1.5 }}>
          Notifications appear when a score update is fetched (every ~5 min). They only work while this tab is open.
        </p>
      </div>
    </div>
  );
}

function LiveNowBanner({ matches, onGoToMatches }) {
  const live = matches.filter((m) => m.status === "LIVE" || m.status === "HT");
  if (!live.length) return null;

  if (live.length === 1) {
    const m = live[0];
    const { h: hs, a: as } = liveScores(m);
    const score = hs != null ? `${hs}–${as}` : "";
    const clock = m.status === "HT" ? " · HT" : m.clock ? ` · ${m.clock}` : "";
    return (
      <div
        onClick={onGoToMatches}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") onGoToMatches(); }}
        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
      >
        <span className="wc-live" style={{ color: C.red, fontSize: 12, fontWeight: 900, flexShrink: 0 }}>🔴 LIVE</span>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {flag(m.home)} {m.home} {score} {m.away} {flag(m.away)}{clock}
        </span>
        <span style={{ fontSize: 13, color: C.dim, flexShrink: 0 }}>→</span>
      </div>
    );
  }

  // 2+ live matches: scrollable chip row
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span className="wc-live" style={{ color: C.red, fontSize: 12, fontWeight: 900 }}>🔴 {live.length} MATCHES LIVE</span>
      </div>
      <div className="wc-noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {live.map((m) => {
          const { h: hs, a: as } = liveScores(m);
          const clock = m.status === "HT" ? "HT" : (m.clock || "LIVE");
          return (
            <button
              key={m.id}
              onClick={onGoToMatches}
              className="wc-btn"
              style={{ flex: "0 0 auto", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "8px 12px", cursor: "pointer", color: C.text, textAlign: "center", minWidth: 130 }}
            >
              <div style={{ fontSize: 11, color: C.red, fontWeight: 900, marginBottom: 4 }}>{clock}</div>
              <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>
                {flag(m.home)} {hs ?? 0}–{as ?? 0} {flag(m.away)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TAB_ITEMS = [
  { id: "matches",   icon: "📅", label: "Matches"   },
  { id: "teams",     icon: "🏴", label: "Teams"     },
  { id: "schedule",  icon: "🗓️", label: "Schedule"  },
  { id: "standings", icon: "📊", label: "Standings" },
  { id: "bracket",   icon: "🏆", label: "Bracket"   },
  { id: "watch",     icon: "📺", label: "Watch"     },
];

const PRIMARY_TABS = TAB_ITEMS.slice(0, 4);
const MORE_TABS    = TAB_ITEMS.slice(4);

function Tabs({ tab, setTab, hasLive }) {
  const [showMore, setShowMore] = useState(false);
  const moreActive = MORE_TABS.some((t) => t.id === tab);

  const selectTab = (id) => { setTab(id); setShowMore(false); };

  return (
    <>
      {/* More tray */}
      {showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{ position: "fixed", inset: 0, zIndex: 195, background: "rgba(0,0,0,0.5)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", left: 0, right: 0,
              bottom: `calc(68px + env(safe-area-inset-bottom, 0px))`,
              background: C.card, borderTop: `1px solid ${C.border}`,
              borderRadius: "16px 16px 0 0", padding: "12px 0 4px",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 900, color: C.dim, letterSpacing: 1, textTransform: "uppercase", padding: "0 20px 10px" }}>More</div>
            {MORE_TABS.map((it) => {
              const active = tab === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => selectTab(it.id)}
                  className="wc-btn"
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 16,
                    padding: "14px 20px", border: "none", background: "none",
                    color: active ? C.green : C.text, fontSize: 17, fontWeight: active ? 900 : 700,
                    cursor: "pointer", textAlign: "left",
                    borderLeft: active ? `3px solid ${C.green}` : "3px solid transparent",
                  }}
                >
                  <span style={{ fontSize: 24 }}>{it.icon}</span>
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div
        role="tablist"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          display: "flex", background: C.card, borderTop: `1px solid ${C.border}`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {PRIMARY_TABS.map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              role="tab"
              aria-selected={active}
              className={`wc-tab${active ? " wc-tab-active" : ""}`}
              onClick={() => { setShowMore(false); setTab(it.id); }}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 2, padding: "8px 2px 6px",
                border: "none", background: "none", color: active ? C.green : C.dim,
                fontSize: 10, fontWeight: active ? 800 : 600, cursor: "pointer",
                borderTop: active ? `2px solid ${C.green}` : "2px solid transparent",
                transition: "color 0.15s",
              }}
            >
              <span style={{ position: "relative", fontSize: 22, lineHeight: 1 }}>
                {it.icon}
                {it.id === "matches" && hasLive && (
                  <span className="wc-live" style={{ position: "absolute", top: -2, right: -4, width: 8, height: 8, borderRadius: "50%", background: C.red, display: "block" }} />
                )}
              </span>
              {it.label}
            </button>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setShowMore((v) => !v)}
          className="wc-tab"
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 2, padding: "8px 2px 6px",
            border: "none", background: "none",
            color: moreActive || showMore ? C.green : C.dim,
            fontSize: 10, fontWeight: moreActive || showMore ? 800 : 600, cursor: "pointer",
            borderTop: moreActive || showMore ? `2px solid ${C.green}` : "2px solid transparent",
            transition: "color 0.15s",
          }}
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>•••</span>
          More
        </button>
      </div>
    </>
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

function TeamRow({ team, score, winner, flash }) {
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
      <span className={flash ? "wc-score-flash" : ""} style={{ fontSize: 26, fontWeight: 900, color: winner ? C.gold : C.text }}>
        {score == null ? "–" : score}
      </span>
    </div>
  );
}

function MatchCard({ m, tz, isFav, prediction, onPredict, onGroupClick }) {
  const now = useNow();
  const isUpcoming = m.status === "NS";
  const hasScore = m.homeScore != null && m.awayScore != null;
  const homeWin = hasScore && m.status === "FT" && m.homeScore > m.awayScore;
  const awayWin = hasScore && m.status === "FT" && m.awayScore > m.homeScore;
  const msToKickoff = new Date(m.date).getTime() - now;
  const minsToKickoff = Math.floor(msToKickoff / 60_000);
  const isImminent = isUpcoming && msToKickoff > 0 && minsToKickoff < 30;
  return (
    <div
      className="wc-card"
      style={{
        background: isFav ? "rgba(251,191,36,0.04)" : C.card,
        border: isFav ? `1px solid rgba(251,191,36,0.45)` : `1px solid ${C.border}`,
        borderRadius: 14, padding: 16, marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span
          onClick={onGroupClick && m.group ? (e) => { e.stopPropagation(); onGroupClick(m.group); } : undefined}
          style={{ fontSize: 14, fontWeight: 700, color: onGroupClick && m.group ? C.green : C.dim, cursor: onGroupClick && m.group ? "pointer" : "default" }}
        >
          {m.group ? `Group ${m.group}` : "Knockout"}
        </span>
        <StatusBadge status={m.status} clock={m.clock} />
      </div>

      {isUpcoming ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>{flag(m.home)}</span>
          <span style={{ fontSize: 18, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.home}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.dim, flexShrink: 0 }}>vs</span>
          <span style={{ fontSize: 18, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{m.away}</span>
          <span style={{ fontSize: 26, lineHeight: 1 }}>{flag(m.away)}</span>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <TeamRow team={m.home} score={hasScore ? m.homeScore : null} winner={homeWin} />
          <TeamRow team={m.away} score={hasScore ? m.awayScore : null} winner={awayWin} />
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, overflow: "hidden" }}>
          <span style={{ fontSize: 15, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            📍 {m.venue}
          </span>
          {isImminent ? (
            <span style={{ fontSize: 14, fontWeight: 900, color: minsToKickoff < 10 ? C.red : C.gold, whiteSpace: "nowrap", flexShrink: 0 }}>
              ⚡ Kicks off in {minsToKickoff}m
            </span>
          ) : (
            <span style={{ fontSize: 16, fontWeight: 800, color: isUpcoming ? C.green : C.dim, whiteSpace: "nowrap", flexShrink: 0 }}>
              {isUpcoming ? `⏰ ${timeLabel(m.date, tz)}` : timeLabel(m.date, tz)}
            </span>
          )}
        </div>
        {isUpcoming && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Countdown date={m.date} />
            <a
              href={calendarUrl(m)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 13, fontWeight: 800, color: C.dim, textDecoration: "none", whiteSpace: "nowrap" }}
            >
              📅 Add to calendar
            </a>
          </div>
        )}
        {isUpcoming && onPredict && (
          <PredictRow matchId={m.id} home={m.home} away={m.away} prediction={prediction} onPredict={onPredict} />
        )}
      </div>
    </div>
  );
}

// Circular icon badge used by the match-detail sections.
const eventBadge = (emoji, bg) => (
  <span style={{ width: 36, height: 36, borderRadius: "50%", background: bg || C.card2, border: `1px solid ${C.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{emoji}</span>
);

// A titled detail section (Goals / Cards) with left-aligned, scannable rows.
// Each row: team flag · label · minute (right-aligned).
function EventSection({ icon, iconBg, title, rows }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 7 }}>
        {eventBadge(icon, iconBg)}
        <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, width: 24, textAlign: "center", flexShrink: 0 }}>{r.flag}</span>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: r.muted ? C.dim : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            {r.minute ? <span style={{ fontSize: 15, fontWeight: 700, color: C.dim, whiteSpace: "nowrap" }}>{r.minute}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// Venue block with a pin badge.
function VenueBlock({ venue }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {eventBadge("📍")}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Venue</div>
        <div style={{ fontSize: 15, color: C.dim }}>{venue}</div>
      </div>
    </div>
  );
}

// "X won by N goals" / "Draw" — null until a result exists.
function resultSummary(m) {
  if (m.homeScore == null || m.awayScore == null) return null;
  const diff = Math.abs(m.homeScore - m.awayScore);
  if (diff === 0) return { icon: "🤝", text: "Draw" };
  const winner = m.homeScore > m.awayScore ? m.home : m.away;
  return { icon: "🏆", text: `${winner} won by ${diff} goal${diff > 1 ? "s" : ""}` };
}

// Goals + cards breakdown (per-row flags). Renders nothing when no data yet.
function MatchEvents({ m }) {
  const goals = m.goals || [];
  const cards = m.cards || [];
  if (!goals.length && !cards.length) return null;
  const teamFlag = (side) => flag(side === "home" ? m.home : m.away);

  const goalRows = goals.map((g) => ({
    flag: teamFlag(g.side),
    label: g.player + (g.pen ? " (pen)" : "") + (g.og ? " (OG)" : ""),
    minute: g.minute,
  }));
  for (const side of ["home", "away"]) {
    if (!goals.some((g) => g.side === side)) {
      goalRows.push({ flag: teamFlag(side), label: "No goals", minute: "", muted: true });
    }
  }
  const cardRows = cards.map((c) => ({
    flag: teamFlag(c.side),
    label: c.player,
    minute: `${c.type === "red" ? "🟥" : "🟨"} ${c.minute}`,
  }));

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {goals.length > 0 && <EventSection icon="⚽" title="Goals" rows={goalRows} />}
      {cards.length > 0 && <EventSection icon="🟨" iconBg="rgba(251,191,36,0.15)" title="Cards" rows={cardRows} />}
    </div>
  );
}

// Evaluate a score prediction against a finished match result.
function evalPrediction(pred, m) {
  if (!pred || m.homeScore == null || m.awayScore == null || m.status !== "FT") return null;
  if (pred.h === m.homeScore && pred.a === m.awayScore)
    return { icon: "✅", label: "Perfect!", pts: 2, color: C.green };
  const predRes = pred.h > pred.a ? 1 : pred.h < pred.a ? -1 : 0;
  const actRes  = m.homeScore > m.awayScore ? 1 : m.homeScore < m.awayScore ? -1 : 0;
  if (predRes === actRes)
    return { icon: "🎯", label: "Right result", pts: 1, color: C.gold };
  return { icon: "❌", label: "Wrong", pts: 0, color: C.red };
}

// Derive live score from goals array — more up-to-date than ESPN's score field during live matches.
function liveScores(m) {
  if (m.goals && m.goals.length > 0) {
    let h = 0, a = 0;
    for (const g of m.goals) {
      const forHome = (g.side === "home" && !g.og) || (g.side === "away" && g.og);
      if (forHome) h++; else a++;
    }
    return { h, a };
  }
  return { h: m.homeScore, a: m.awayScore };
}

// Side-by-side match stats bar (possession, shots, etc.) shown in expanded cards.
const STAT_LABELS = {
  possessionPct: { label: "Possession", suffix: "%" },
  totalShots:    { label: "Total Shots" },
  shotsOnTarget: { label: "Shots on Target" },
  saves:         { label: "Saves" },
  totalFouls:    { label: "Fouls" },
  cornerKicks:   { label: "Corners" },
  offsides:      { label: "Offsides" },
};

function MatchStatsTable({ homeStats, awayStats, home, away }) {
  if (!homeStats && !awayStats) return null;
  const hs = homeStats || {};
  const as = awayStats || {};
  const keys = Object.keys(STAT_LABELS).filter((k) => hs[k] != null || as[k] != null);
  if (!keys.length) return null;

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        {eventBadge("📊")}
        <div style={{ fontSize: 18, fontWeight: 800 }}>Match Stats</div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, overflow: "hidden" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, minWidth: 0, overflow: "hidden" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.green, flexShrink: 0, display: "inline-block" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{flag(home)} {home}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, minWidth: 0, overflow: "hidden", flexShrink: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{away} {flag(away)}</span>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.dim, flexShrink: 0, display: "inline-block" }} />
        </span>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr)" }}>
        {keys.map((k) => {
          const { label, suffix = "" } = STAT_LABELS[k];
          const hv = parseFloat(hs[k]) || 0;
          const av = parseFloat(as[k]) || 0;
          const total = hv + av || 1;
          const hPct = Math.round((hv / total) * 100);
          return (
            <div key={k}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800, marginBottom: 5, gap: 4 }}>
                <span style={{ color: C.green, flexShrink: 0 }}>{hs[k] != null ? `${hs[k]}${suffix}` : "–"}</span>
                <span style={{ color: C.dim, fontWeight: 700, fontSize: 12, textAlign: "center", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                <span style={{ color: C.dim, flexShrink: 0 }}>{as[k] != null ? `${as[k]}${suffix}` : "–"}</span>
              </div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: C.border }}>
                <div style={{ width: `${hPct}%`, background: C.green }} />
                <div style={{ flex: 1, background: C.dim }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecapBlock({ recap }) {
  if (!recap) return null;
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        {eventBadge("📰")}
        <div style={{ fontSize: 18, fontWeight: 800 }}>Match Recap</div>
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: C.dim }}>{recap}</p>
    </div>
  );
}

function ShareButton({ m }) {
  const [done, setDone] = useState(false);

  const shareText = () => {
    const score = m.homeScore != null ? `${m.homeScore}–${m.awayScore}` : "vs";
    const status = m.status === "LIVE" ? `🔴 LIVE${m.clock ? ` (${m.clock})` : ""}` : m.status === "HT" ? "🟡 Half Time" : "✅ FT";
    return `${status}: ${m.home} ${score} ${m.away}${m.group ? ` | Group ${m.group}` : ""} | FIFA World Cup 2026`;
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    const text = shareText();
    const url = "https://fifa.shammas.in";
    if (navigator.share) {
      try { await navigator.share({ title: "FIFA World Cup 2026", text, url }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {}
  };

  return (
    <button
      onClick={handleShare}
      aria-label="Share match"
      title="Share"
      style={{
        background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
        fontSize: 17, lineHeight: 1, color: done ? C.green : C.dim, flexShrink: 0,
        transition: "color 0.2s",
      }}
    >
      {done ? "✓" : "📤"}
    </button>
  );
}

// Toasts for score changes detected since last visit.
function GoalToast({ alerts }) {
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(true);

  const next = () => { setShow(false); setTimeout(() => { setIdx((i) => i + 1); setShow(true); }, 240); };

  useEffect(() => {
    if (idx >= alerts.length) return;
    navigator.vibrate?.(200);
    const t = setTimeout(next, 4500);
    return () => clearTimeout(t);
  }, [idx, alerts.length]);

  if (!alerts.length || idx >= alerts.length) return null;
  const a = alerts[idx];

  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 200, width: "min(360px, 92vw)",
      background: C.card2, border: `1px solid rgba(34,197,94,0.5)`,
      borderRadius: 14, padding: "12px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
      opacity: show ? 1 : 0, transition: "opacity 0.22s",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 26, flexShrink: 0 }}>⚽</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: C.green, letterSpacing: 0.8, marginBottom: 2 }}>{a.headline}</div>
        <div style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {flag(a.home)} {a.home} {a.homeScore}–{a.awayScore} {a.away} {flag(a.away)}
        </div>
      </div>
      {alerts.length > 1 && <span style={{ fontSize: 12, color: C.dim, flexShrink: 0 }}>{idx + 1}/{alerts.length}</span>}
      <button onClick={next} style={{ background: "none", border: "none", color: C.dim, fontSize: 18, cursor: "pointer", flexShrink: 0, padding: "0 2px" }}>✕</button>
    </div>
  );
}

function LiveMatchModal({ m, onClose, onRefresh }) {
  // Fetch fresh match data every 30 s without a full page reload.
  useEffect(() => {
    const t = setInterval(() => onRefresh?.(), 30_000);
    return () => clearInterval(t);
  }, [onRefresh]);

  // Request native fullscreen (Android Chrome / desktop). iOS Safari silently ignores.
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    // Back-button on Android or Esc on desktop exits fullscreen → close modal.
    const onFs = () => { if (!document.fullscreenElement) onClose(); };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Lock body scroll (fallback for iOS where fullscreen API is unavailable).
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Escape to close on desktop.
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  // Countdown to next auto-refresh.
  const [secs, setSecs] = useState(30);
  useEffect(() => {
    setSecs(30);
    const t = setInterval(() => setSecs((s) => (s <= 1 ? 30 : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const wide = useWindowWidth() >= 768;
  const { h: mh, a: ma } = liveScores(m);
  const hasScore = mh != null && ma != null;
  const watchQuery = encodeURIComponent(`${m.home} vs ${m.away} live`);

  const panelStyle = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
    padding: "20px 22px", display: "flex", flexDirection: "column",
  };
  const panelHead = (icon, title) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(220,38,38,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: 0.5 }}>{title}</span>
    </div>
  );

  // Goals rows extracted for the panel view.
  const goals = m.goals || [];
  const cards = m.cards || [];
  const goalRows = goals.map((g) => ({
    flag: flag(g.side === "home" ? m.home : m.away),
    label: g.player + (g.pen ? " (pen)" : "") + (g.og ? " (OG)" : ""),
    minute: g.minute,
  }));

  // Stats rows.
  const hs = m.homeStats || {};
  const as = m.awayStats || {};
  const statKeys = Object.keys(STAT_LABELS).filter((k) => hs[k] != null || as[k] != null);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Sticky header */}
      <div style={{ flexShrink: 0, background: C.bg, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <StatusBadge status={m.status} clock={m.clock} />
          {m.group && <span style={{ fontSize: 13, fontWeight: 700, color: C.dim }}>Group {m.group}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.dim }}>↻ {secs}s</span>
          <ShareButton m={m} />
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: "50%", border: `1px solid ${C.border}`, background: "none", color: C.text, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >✕</button>
        </div>
      </div>

      {wide ? (
        /* ── WIDE LAYOUT (tablet / desktop) ───────────────────────── */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 20px 20px", gap: 14, minHeight: 0 }}>
          {/* Three-column panel row */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, minHeight: 0 }}>

            {/* Panel 1 — Score */}
            {(() => {
              const homeYellow = cards.filter(c => c.side === "home" && c.type === "yellow").length;
              const homeRed    = cards.filter(c => c.side === "home" && c.type === "red").length;
              const awayYellow = cards.filter(c => c.side === "away" && c.type === "yellow").length;
              const awayRed    = cards.filter(c => c.side === "away" && c.type === "red").length;
              const hasCards   = homeYellow + homeRed + awayYellow + awayRed > 0;
              const statusLabel = m.status === "FT" ? "FULL TIME" : m.status === "HT" ? "HALF TIME" : "LIVE";
              return (
                <div style={panelStyle}>
                  {panelHead("🏆", "SCORE")}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>

                    {/* Teams + score — main hero area */}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-around", gap: 8, padding: "10px 0" }}>
                      <div style={{ textAlign: "center", flex: 1 }}>
                        <div style={{ fontSize: 80, lineHeight: 1.05 }}>{flag(m.home)}</div>
                        <div style={{ fontSize: 19, fontWeight: 900, marginTop: 12, lineHeight: 1.3 }}>{m.home}</div>
                        {hasCards && (
                          <div style={{ marginTop: 8, fontSize: 14, color: C.dim }}>
                            {homeYellow > 0 && <span>🟨 {homeYellow} </span>}
                            {homeRed    > 0 && <span>🟥 {homeRed}</span>}
                            {homeYellow === 0 && homeRed === 0 && <span style={{ opacity: 0 }}>–</span>}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: "center", minWidth: 90 }}>
                        {hasScore
                          ? <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: -3, lineHeight: 1 }}>{mh}<span style={{ color: C.dim }}>–</span>{ma}</div>
                          : <div style={{ fontSize: 28, color: C.dim, fontWeight: 700 }}>vs</div>}
                      </div>

                      <div style={{ textAlign: "center", flex: 1 }}>
                        <div style={{ fontSize: 80, lineHeight: 1.05 }}>{flag(m.away)}</div>
                        <div style={{ fontSize: 19, fontWeight: 900, marginTop: 12, lineHeight: 1.3 }}>{m.away}</div>
                        {hasCards && (
                          <div style={{ marginTop: 8, fontSize: 14, color: C.dim }}>
                            {awayYellow > 0 && <span>🟨 {awayYellow} </span>}
                            {awayRed    > 0 && <span>🟥 {awayRed}</span>}
                            {awayYellow === 0 && awayRed === 0 && <span style={{ opacity: 0 }}>–</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status bar */}
                    {hasScore && (
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", justifyContent: "space-around", alignItems: "center" }}>
                        <span style={{ fontSize: 17, color: C.dim }}>⚽ <strong style={{ color: C.text, fontSize: 20 }}>{mh}</strong></span>
                        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, color: C.dim }}>{statusLabel}</span>
                        <span style={{ fontSize: 17, color: C.dim }}><strong style={{ color: C.text, fontSize: 20 }}>{ma}</strong> ⚽</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Panel 2 — Goals */}
            <div style={panelStyle}>
              {panelHead("⚽", "GOALS")}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {goalRows.length === 0 && cards.length === 0 ? (
                  <div style={{ color: C.dim, fontSize: 14, textAlign: "center", marginTop: 20 }}>No events yet</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {goalRows.map((g, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{g.flag}</span>
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: C.dim, whiteSpace: "nowrap" }}>{g.minute}</span>
                      </div>
                    ))}
                    {cards.map((c, i) => (
                      <div key={`c${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{flag(c.side === "home" ? m.home : m.away)}</span>
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.player}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: C.dim, whiteSpace: "nowrap" }}>{c.type === "red" ? "🟥" : "🟨"} {c.minute}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Panel 3 — Stats */}
            <div style={panelStyle}>
              {panelHead("📊", "MATCH STATS")}
              {statKeys.length === 0 ? (
                <div style={{ color: C.dim, fontSize: 14, textAlign: "center", marginTop: 20 }}>Stats not available yet</div>
              ) : (
                <div style={{ flex: 1, overflowY: "auto", display: "grid", gap: 16 }}>
                  {statKeys.map((k) => {
                    const { label, suffix = "" } = STAT_LABELS[k];
                    const hv = parseFloat(hs[k]) || 0;
                    const av = parseFloat(as[k]) || 0;
                    const total = hv + av || 1;
                    const hPct = Math.round((hv / total) * 100);
                    return (
                      <div key={k}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
                          <span style={{ color: C.green }}>{hs[k] != null ? `${hs[k]}${suffix}` : "–"}</span>
                          <span style={{ color: C.dim, fontWeight: 700, fontSize: 13 }}>{label}</span>
                          <span style={{ color: "#aaa" }}>{as[k] != null ? `${as[k]}${suffix}` : "–"}</span>
                        </div>
                        <div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", background: C.border }}>
                          <div style={{ width: `${hPct}%`, background: C.green, borderRadius: "4px 0 0 4px" }} />
                          <div style={{ flex: 1, background: "#555", borderRadius: "0 4px 4px 0" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Bottom bar — venue + Watch Live */}
          <div style={{ flexShrink: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📍</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>Venue</div>
                <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.venue}</div>
              </div>
            </div>
            <a
              href={`https://www.google.com/search?q=${watchQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, fontSize: 16, fontWeight: 900, color: "#06210f", background: C.green, borderRadius: 12, padding: "12px 22px", textDecoration: "none" }}
            >
              ▶ Watch Live
            </a>
          </div>
          {m.recap && (
            <div style={{ flexShrink: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                {eventBadge("📰")}
                <div style={{ fontSize: 16, fontWeight: 800 }}>Match Recap</div>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.dim }}>{m.recap}</p>
            </div>
          )}
        </div>
      ) : (
        /* ── MOBILE LAYOUT (single column scroll) ─────────────────── */
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px 40px", maxWidth: 600, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
          {/* Large score */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", gap: 8, marginBottom: 36 }}>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: 62, lineHeight: 1.1 }}>{flag(m.home)}</div>
              <div style={{ fontSize: 17, fontWeight: 900, marginTop: 8, lineHeight: 1.3 }}>{m.home}</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 80 }}>
              {hasScore
                ? <div style={{ fontSize: 54, fontWeight: 900, letterSpacing: -2 }}>{mh}<span style={{ color: C.dim }}>–</span>{ma}</div>
                : <div style={{ fontSize: 26, color: C.dim }}>vs</div>}
            </div>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: 62, lineHeight: 1.1 }}>{flag(m.away)}</div>
              <div style={{ fontSize: 17, fontWeight: 900, marginTop: 8, lineHeight: 1.3 }}>{m.away}</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
            <MatchEvents m={m} />
            <MatchStatsTable homeStats={m.homeStats} awayStats={m.awayStats} home={m.home} away={m.away} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 0 }}>
                {eventBadge("📍")}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Venue</div>
                  <div style={{ fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.venue}</div>
                </div>
              </div>
              <a
                href={`https://www.google.com/search?q=${watchQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, fontSize: 14, fontWeight: 800, color: "#06210f", background: C.green, borderRadius: 10, padding: "10px 14px", textDecoration: "none" }}
              >
                ▶ Watch Live
              </a>
            </div>
            <RecapBlock recap={m.recap} />
          </div>
        </div>
      )}
    </div>
  );
}

// Full live-match card: score, live minute, goals/cards so far, and a watch link.
function LiveCard({ m, tz, isFav, onOpen, onGroupClick }) {
  const { h: hs, a: as } = liveScores(m);
  const hasScore = hs != null && as != null;
  const homeFlash = useScoreFlash(hs);
  const awayFlash = useScoreFlash(as);
  const watchQuery = encodeURIComponent(`${m.home} vs ${m.away} live`);
  return (
    <div
      id={`match-${m.id}`}
      className="wc-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(m)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(m); } }}
      style={{ background: isFav ? "rgba(251,191,36,0.04)" : C.card, border: isFav ? "1px solid rgba(251,191,36,0.5)" : "1px solid rgba(239,68,68,0.45)", borderRadius: 14, padding: 16, marginBottom: 12, cursor: "pointer", overflow: "hidden" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span
          onClick={onGroupClick && m.group ? (e) => { e.stopPropagation(); onGroupClick(m.group); } : undefined}
          style={{ fontSize: 14, fontWeight: 700, color: onGroupClick && m.group ? C.green : C.dim, cursor: onGroupClick && m.group ? "pointer" : "default" }}
        >
          {m.group ? `Group ${m.group}` : "Knockout"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={m.status} clock={m.clock} />
          <span style={{ fontSize: 12, color: C.dim }}>⛶ Full screen</span>
          <ShareButton m={m} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <TeamRow team={m.home} score={hasScore ? hs : null} winner={false} flash={homeFlash} />
        <TeamRow team={m.away} score={hasScore ? as : null} winner={false} flash={awayFlash} />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 14, display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <MatchEvents m={m} />
        <MatchStatsTable homeStats={m.homeStats} awayStats={m.awayStats} home={m.home} away={m.away} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 0 }}>
            {eventBadge("📍")}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Venue</div>
              <div style={{ fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.venue}</div>
            </div>
          </div>
          <a
            className="wc-btn"
            href={`https://www.google.com/search?q=${watchQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, fontSize: 14, fontWeight: 800, color: "#06210f", background: C.green, borderRadius: 10, padding: "10px 14px", textDecoration: "none" }}
          >
            ▶ Watch Live
          </a>
        </div>
      </div>
    </div>
  );
}

// Compact, collapsible card for finished matches: score + time when closed;
// tap to reveal goal scorers, cards, venue, and a highlights link.
function ResultCard({ m, tz, isFav, prediction, onGroupClick }) {
  const [open, setOpen] = useState(false);
  const homeWin = m.homeScore > m.awayScore;
  const awayWin = m.awayScore > m.homeScore;
  const hlQuery = encodeURIComponent(`${m.home} vs ${m.away} World Cup 2026 highlights`);
  const summary = resultSummary(m);
  const predResult = evalPrediction(prediction, m);

  const teamLine = (team, score, win) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>{flag(team)}</span>
        <span style={{ fontSize: 19, fontWeight: win ? 900 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team}</span>
      </span>
      <span style={{ fontSize: 28, fontWeight: 900, color: win ? C.gold : C.text }}>{score}</span>
    </div>
  );

  return (
    <div
      id={`match-${m.id}`}
      className="wc-card"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
      style={{ background: isFav ? "rgba(251,191,36,0.04)" : C.card, border: isFav ? `1px solid rgba(251,191,36,0.45)` : `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 8, cursor: "pointer" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span
          onClick={onGroupClick && m.group ? (e) => { e.stopPropagation(); onGroupClick(m.group); } : undefined}
          style={{ fontSize: 13, fontWeight: 700, color: onGroupClick && m.group ? C.green : C.dim, cursor: onGroupClick && m.group ? "pointer" : "default" }}
        >
          {m.group ? `Group ${m.group}` : "Knockout"} · FT
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: C.dim }}>{timeLabel(m.date, tz)}</span>
          <ShareButton m={m} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {teamLine(m.home, m.homeScore, homeWin)}
        {teamLine(m.away, m.awayScore, awayWin)}
      </div>

      {summary && (
        <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: C.gold, marginTop: 8 }}>
          {summary.icon} {summary.text}
        </div>
      )}

      {predResult && (
        <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: predResult.color, marginTop: 6 }}>
          {predResult.icon} {predResult.label} · Your pick: {prediction.h}–{prediction.a}
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: 12, color: C.dim, marginTop: 6 }}>
        {open ? "▲ Hide details" : "▼ Tap for goals & details"}
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 14, display: "grid", gap: 16 }}>
          {m.recap && (
            <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
              "{m.recap}"
            </p>
          )}
          <MatchEvents m={m} />
          <MatchStatsTable homeStats={m.homeStats} awayStats={m.awayStats} home={m.home} away={m.away} />
          <VenueBlock venue={m.venue} />
          <a
            className="wc-btn"
            href={`https://www.youtube.com/results?search_query=${hlQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxSizing: "border-box", width: "100%", fontSize: 18, fontWeight: 800, color: "#fff", background: "#ff0033", borderRadius: 12, padding: "14px 16px", textDecoration: "none" }}
          >
            ▶ Watch Highlights
          </a>
        </div>
      )}
    </div>
  );
}

// Live countdown shown when kickoff is within 24 h.
function Countdown({ date }) {
  const now = useNow();
  const diff = new Date(date).getTime() - now;
  if (diff <= 0 || diff > 24 * 3600 * 1000) return null;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const totalMins = h * 60 + m;
  const color = totalMins < 10 ? C.red : totalMins < 30 ? C.gold : C.green;
  return (
    <span style={{ fontSize: 13, fontWeight: 800, color }}>
      ⏱ {h > 0 ? `${h}h ${m}m` : `${m}m`} to kickoff
    </span>
  );
}

// +/- stepper used in the score predictor.
function Stepper({ value, onChange }) {
  const btn = {
    width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`,
    background: C.card2, color: C.text, fontSize: 18, fontWeight: 900,
    cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <button style={btn} onClick={(e) => { e.stopPropagation(); onChange(-1); }}>−</button>
      <span style={{ minWidth: 22, textAlign: "center", fontSize: 17, fontWeight: 900 }}>{value}</span>
      <button style={btn} onClick={(e) => { e.stopPropagation(); onChange(1); }}>+</button>
    </div>
  );
}

function PredictRow({ matchId, home, away, prediction, onPredict }) {
  const [open, setOpen] = useState(!!prediction);
  const h = prediction?.h ?? 0;
  const a = prediction?.a ?? 0;

  if (!open) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); if (!prediction) onPredict(matchId, { h: 0, a: 0 }); }}
        style={{ fontSize: 13, fontWeight: 800, color: C.dim, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}
      >
        🔮 Predict score
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: C.dim, flexShrink: 0 }}>🔮</span>
      <span style={{ fontSize: 12, color: C.dim, maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{home}</span>
      <Stepper value={h} onChange={(d) => onPredict(matchId, { h: Math.max(0, h + d), a })} />
      <span style={{ color: C.dim, fontWeight: 700, flexShrink: 0 }}>–</span>
      <Stepper value={a} onChange={(d) => onPredict(matchId, { h, a: Math.max(0, a + d) })} />
      <span style={{ fontSize: 12, color: C.dim, maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{away}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onPredict(matchId, null); setOpen(false); }}
        style={{ marginLeft: "auto", background: "none", border: "none", color: C.dim, fontSize: 15, cursor: "pointer", padding: "0 2px" }}
      >✕</button>
    </div>
  );
}

// Group filter as a compact dropdown (saves the space of 13 wrapping chips).
function GroupFilter({ groups, value, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span style={{ fontSize: 16, color: C.dim, whiteSpace: "nowrap" }}>🏆 Group</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1, fontSize: 16, fontWeight: 700, color: C.text, background: C.card,
          border: `2px solid ${C.border}`, borderRadius: 10, padding: "11px 12px",
        }}
      >
        {groups.map((g) => (
          <option key={g} value={g}>{g === "All" ? "All groups" : `Group ${g}`}</option>
        ))}
      </select>
    </label>
  );
}

// One compact row in the full Schedule list (works for any status).
function ScheduleRow({ m, tz, onMatchClick }) {
  const s = STATUS[m.status] || STATUS.NS;
  const hasScore = m.homeScore != null && m.awayScore != null;
  const isClickable = m.status === "FT" || m.status === "LIVE" || m.status === "HT";
  const teamCell = (team) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 18 }}>{flag(team)}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{team}</span>
    </div>
  );
  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? () => onMatchClick?.(m) : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onMatchClick?.(m); } } : undefined}
      style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", marginBottom: 6, cursor: isClickable ? "pointer" : "default" }}
    >
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          <span className={s.live ? "wc-live" : undefined} style={{ fontSize: 11, fontWeight: 800, color: s.color, marginTop: 2 }}>
            {s.live ? "🔴 " : ""}{m.status === "NS" ? (m.group ? `Group ${m.group}` : "Knockout") : s.label}
          </span>
          {isClickable && <span style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>→</span>}
        </div>
      </div>
    </div>
  );
}

// Full tournament schedule: every fixture, grouped by day (soonest first).
function ScheduleTab({ matches, tz, onMatchClick }) {
  const groups = useMemo(
    () => ["All", ...Array.from(new Set(matches.map((m) => m.group).filter(Boolean))).sort()],
    [matches]
  );
  const [groupFilter, setGroupFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [stageFilter, setStageFilter] = useState(null);

  const todayKey = dateKey(new Date().toISOString(), tz);
  const matchDates = useMemo(
    () => new Set(matches.map((m) => dateKey(m.date, tz))),
    [matches, tz]
  );
  // Tournament bounds for min/max
  const minDate = "2026-06-11";
  const maxDate = "2026-07-19";

  const matchStage = (m) => {
    if (m.status === "NS" && !m.group) {
      const d = m.date?.slice(0, 10);
      if (d >= "2026-07-09" && d <= "2026-07-12") return "qf";
      if (d >= "2026-07-14" && d <= "2026-07-15") return "sf";
      if (d >= "2026-07-19") return "final";
    }
    return m.status === "NS" ? "upcoming" : null;
  };

  const filtered = matches.filter(
    (m) =>
      (groupFilter === "All" || m.group === groupFilter) &&
      (dateFilter === "" || dateKey(m.date, tz) === dateFilter) &&
      (!stageFilter || matchStage(m) === stageFilter)
  );
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
      <GroupFilter groups={groups} value={groupFilter} onChange={setGroupFilter} />

      {/* Date picker row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.dim, whiteSpace: "nowrap" }}>📅 Date</span>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="date"
            value={dateFilter}
            min={minDate}
            max={maxDate}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: C.card, color: C.text, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "10px 12px", fontSize: 15, fontWeight: 700,
              colorScheme: "dark", outline: "none", appearance: "none",
            }}
          />
        </div>
        {dateFilter !== "" && (
          <button
            onClick={() => setDateFilter("")}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.dim, fontSize: 13, fontWeight: 700, padding: "8px 10px", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            ✕ Clear
          </button>
        )}
        {dateFilter !== todayKey && matchDates.has(todayKey) && (
          <button
            onClick={() => setDateFilter(todayKey)}
            style={{ background: "none", border: `1px solid ${C.green}`, borderRadius: 8, color: C.green, fontSize: 13, fontWeight: 700, padding: "8px 10px", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Today
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { key: "upcoming", label: "Upcoming" },
          { key: "qf",      label: "Qtr" },
          { key: "sf",      label: "Semi" },
          { key: "final",   label: "Final" },
        ].map(({ key, label }) => {
          const active = stageFilter === key;
          return (
            <button
              key={key}
              onClick={() => setStageFilter(active ? null : key)}
              style={{
                flex: 1, background: active ? "rgba(34,197,94,0.15)" : C.card,
                border: `1px solid ${active ? C.green : C.border}`,
                borderRadius: 20, padding: "8px 0", fontSize: 13, fontWeight: 700,
                color: active ? C.green : C.dim, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {sections.length === 0 && <EmptyState emoji="🗓️" text="No matches on this date." />}
      {sections.map((sec) => (
        <section key={sec.key} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.gold, margin: "0 0 8px" }}>{sec.label}</h3>
          {sec.items.map((m) => (
            <ScheduleRow key={m.id} m={m} tz={tz} onMatchClick={onMatchClick} />
          ))}
        </section>
      ))}
    </div>
  );
}

function MatchesTab({ matches, tz, favTeams, predictions, onPredict, onOpenLive, onGoToTeams, onGoToStandings }) {
  const groups = useMemo(() => ["All", ...Array.from(new Set(matches.map((m) => m.group).filter(Boolean))).sort()], [matches]);
  const [groupFilter, setGroupFilter] = useLocalStorage("wc_group_filter", "All");

  const filtered = matches.filter((m) => groupFilter === "All" || m.group === groupFilter);
  const isLive = (m) => m.status === "LIVE" || m.status === "HT";
  const isFav = (m) => favTeams.length > 0 && (favTeams.includes(m.home) || favTeams.includes(m.away));
  const todayKey = dateKey(new Date().toISOString(), tz);

  // Always include LIVE/HT matches regardless of date — a late match crossing
  // midnight would otherwise fall through every section filter.
  const todayMatches = [...filtered]
    .filter((m) => isLive(m) || dateKey(m.date, tz) === todayKey)
    .sort((a, b) => {
      if (isFav(a) !== isFav(b)) return isFav(a) ? -1 : 1;
      const aLive = isLive(a) ? 0 : 1;
      const bLive = isLive(b) ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return new Date(a.date) - new Date(b.date);
    });

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
    if (favTeams.length > 0) {
      for (const sec of out) sec.items.sort((a, b) => (isFav(a) ? 0 : 1) - (isFav(b) ? 0 : 1));
    }
    return out;
  };

  const resultSections = daySections(filtered.filter((m) => m.status === "FT" && dateKey(m.date, tz) !== todayKey), true);
  const upcomingSections = daySections(filtered.filter((m) => !isLive(m) && m.status !== "FT" && dateKey(m.date, tz) !== todayKey), false);
  const isEmpty = !todayMatches.length && !resultSections.length && !upcomingSections.length;
  const todayLabel = dayHeader(new Date().toISOString(), tz);

  // Prediction tally across all matches
  const tally = useMemo(() => {
    let perfect = 0, right = 0, wrong = 0, pending = 0;
    for (const m of matches) {
      const pred = predictions[m.id];
      if (!pred) continue;
      const r = evalPrediction(pred, m);
      if (!r) { pending++; continue; }
      if (r.pts === 2) perfect++;
      else if (r.pts === 1) right++;
      else wrong++;
    }
    return { perfect, right, wrong, pending, total: perfect + right + wrong + pending };
  }, [matches, predictions]);

  // Fav team spotlight cards: live first, else next upcoming, else last result
  const favSpotlights = favTeams.map((favTeam) => ({
    team: favTeam,
    match:
      matches.find((m) => (m.home === favTeam || m.away === favTeam) && (m.status === "LIVE" || m.status === "HT")) ||
      matches.filter((m) => (m.home === favTeam || m.away === favTeam) && m.status === "NS").sort((a, b) => new Date(a.date) - new Date(b.date))[0] ||
      matches.filter((m) => (m.home === favTeam || m.away === favTeam) && m.status === "FT").sort((a, b) => new Date(b.date) - new Date(a.date))[0] ||
      null,
  }));

  return (
    <div>
      {favTeams.length === 0 && (
        <button
          onClick={onGoToTeams}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: `${C.gold}0d`, border: `1px dashed ${C.gold}55`, borderRadius: 12, padding: "12px 14px", marginBottom: 14, cursor: "pointer", color: C.text, textAlign: "left" }}
        >
          <span style={{ fontSize: 20 }}>⭐</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Follow a team to see their matches here</span>
          <span style={{ fontSize: 13, color: C.gold, fontWeight: 800, whiteSpace: "nowrap" }}>Teams →</span>
        </button>
      )}

      {favSpotlights.length > 0 && (
        <div style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {favSpotlights.map(({ team, match: favMatch }) => {
            if (!favMatch) return null;
            const isLiveMatch = favMatch.status === "LIVE" || favMatch.status === "HT";
            const isUpcoming = favMatch.status === "NS";
            return (
              <div key={team} style={{ background: `linear-gradient(135deg, ${C.gold}18, ${C.card})`, border: `1px solid ${C.gold}55`, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: C.gold, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                  ⭐ {flag(team)} {team}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{flag(favMatch.home)} {favMatch.home}</span>
                  <span style={{ fontWeight: 900, fontSize: 17, color: isLiveMatch ? C.red : C.text, minWidth: 48, textAlign: "center" }}>
                    {isUpcoming ? "vs" : `${favMatch.homeScore ?? 0}–${favMatch.awayScore ?? 0}`}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 15, textAlign: "right" }}>{favMatch.away} {flag(favMatch.away)}</span>
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 8, display: "flex", gap: 12 }}>
                  {isLiveMatch && <span style={{ color: C.red, fontWeight: 800 }}>🔴 LIVE {favMatch.clock}</span>}
                  {isUpcoming && <span>⏰ {fmt(favMatch.date, tz, { weekday: "short", month: "short", day: "numeric" })} · {timeLabel(favMatch.date, tz)}</span>}
                  {favMatch.status === "FT" && <span>FT</span>}
                  {favMatch.venue && <span>📍 {favMatch.venue.split(",")[0]}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <GroupFilter groups={groups} value={groupFilter} onChange={setGroupFilter} />
      {groupFilter !== "All" && (() => {
        const rows = (computeStandings(matches)[groupFilter] || []);
        if (!rows.length) return null;
        const cell = { padding: "7px 8px", textAlign: "center", fontSize: 13, fontWeight: 700 };
        return (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.card2 }}>
                  <th style={{ ...cell, textAlign: "left", paddingLeft: 12, color: C.dim, fontWeight: 800 }}>Group {groupFilter}</th>
                  <th style={{ ...cell, color: C.dim, fontWeight: 800 }}>P</th>
                  <th style={{ ...cell, color: C.dim, fontWeight: 800 }}>GD</th>
                  <th style={{ ...cell, color: C.green, fontWeight: 800 }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.team} style={{ borderTop: `1px solid ${C.border}`, background: i < 2 ? `${C.green}0a` : "transparent" }}>
                    <td style={{ ...cell, textAlign: "left", paddingLeft: 12, fontWeight: 700 }}>
                      {flag(r.team)} {r.team}
                      {i < 2 && <span style={{ marginLeft: 6, fontSize: 10, color: C.green, fontWeight: 900, verticalAlign: "middle" }}>Q</span>}
                    </td>
                    <td style={cell}>{r.P}</td>
                    <td style={{ ...cell, color: r.GD > 0 ? C.green : r.GD < 0 ? C.red : C.dim }}>{r.GD > 0 ? `+${r.GD}` : r.GD}</td>
                    <td style={{ ...cell, fontWeight: 900, color: C.green }}>{r.Pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {tally.total > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: C.dim }}>🔮 Predictions</span>
          {tally.perfect > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: C.green }}>✅ {tally.perfect} perfect</span>}
          {tally.right > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: C.gold }}>🎯 {tally.right} right</span>}
          {tally.wrong > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: C.red }}>❌ {tally.wrong} wrong</span>}
          {tally.pending > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: C.dim }}>⏳ {tally.pending} pending</span>}
        </div>
      )}

      {isEmpty && <EmptyState emoji="📭" text="No matches to show yet." />}

      {todayMatches.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.green, margin: "0 0 4px" }}>📅 Today</h2>
          <p style={{ fontSize: 14, color: C.dim, margin: "0 0 14px" }}>{todayLabel}</p>
          {todayMatches.map((m) =>
            isLive(m) ? <LiveCard key={m.id} m={m} tz={tz} isFav={isFav(m)} onOpen={onOpenLive} onGroupClick={onGoToStandings} />
            : m.status === "FT" ? <ResultCard key={m.id} m={m} tz={tz} isFav={isFav(m)} prediction={predictions[m.id]} onGroupClick={onGoToStandings} />
            : <MatchCard key={m.id} m={m} tz={tz} isFav={isFav(m)} prediction={predictions[m.id]} onPredict={onPredict} onGroupClick={onGoToStandings} />
          )}
        </section>
      )}

      {resultSections.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.gold, margin: "0 0 14px" }}>✅ Results</h2>
          {resultSections.map((sec) => (
            <section key={sec.key} style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: C.dim, margin: "0 0 10px" }}>{sec.label}</h3>
              {sec.items.map((m) => <ResultCard key={m.id} m={m} tz={tz} isFav={isFav(m)} prediction={predictions[m.id]} onGroupClick={onGoToStandings} />)}
            </section>
          ))}
        </div>
      )}

      {upcomingSections.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.dim, margin: "0 0 14px" }}>📅 Upcoming</h2>
          {upcomingSections.map((sec) => (
            <section key={sec.key} style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: C.dim, margin: "0 0 10px" }}>{sec.label}</h3>
              {sec.items.map((m) => <MatchCard key={m.id} m={m} tz={tz} isFav={isFav(m)} prediction={predictions[m.id]} onPredict={onPredict} onGroupClick={onGoToStandings} />)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TopScorers({ matches }) {
  const scorers = useMemo(() => {
    const map = {};
    for (const m of matches) {
      for (const g of m.goals || []) {
        if (g.og) continue;
        const team = g.side === "home" ? m.home : m.away;
        const k = `${g.player}||${team}`;
        if (!map[k]) map[k] = { player: g.player, team, goals: 0 };
        map[k].goals++;
      }
    }
    return Object.values(map).sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player));
  }, [matches]);

  if (!scorers.length) return <EmptyState emoji="⚽" text="Scorers will appear once goals are scored." />;

  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 19, fontWeight: 900, color: C.gold, margin: "0 0 10px" }}>⚽ Top Scorers</h2>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        {scorers.map((s, i) => (
          <div key={s.player + s.team} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: i === 0 ? "rgba(251,191,36,0.1)" : "transparent" }}>
            <span style={{ fontSize: 15, fontWeight: 900, color: C.gold, width: 22, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{flag(s.team)}</span>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.player}</span>
            <span style={{ fontSize: 13, color: C.dim, whiteSpace: "nowrap" }}>{s.team}</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: C.gold, minWidth: 24, textAlign: "right" }}>{s.goals}</span>
          </div>
        ))}
      </div>
    </section>
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

  // Qualification badge per rank (only definitive when all 3 matches played)
  const qualBadge = (rank, groupRows) => {
    const complete = groupRows.every((r) => r.P === 3);
    if (!complete) return null;
    if (rank <= 2) return <span title="Qualified" style={{ marginLeft: 6, fontSize: 13 }}>✅</span>;
    if (rank === 3) return <span title="Possible (best 3rd)" style={{ marginLeft: 6, fontSize: 13 }}>🟡</span>;
    return <span title="Eliminated" style={{ marginLeft: 6, fontSize: 13 }}>❌</span>;
  };

  return (
    <div>
      {groups.map((g) => {
        const rows = standings[g];
        return (
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
                  {rows.map((r, i) => (
                    <tr key={r.team} style={{ borderTop: `1px solid ${C.border}`, background: i < 2 ? "rgba(34,197,94,0.06)" : "transparent" }}>
                      <td style={{ ...cell, textAlign: "left", paddingLeft: 14 }}>
                        <span style={{ marginRight: 8 }}>{flag(r.team)}</span>
                        {r.team}
                        {qualBadge(i + 1, rows)}
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
              Top 2 advance · ✅ Qualified · 🟡 Possible (best 3rd) · ❌ Eliminated
            </p>
          </section>
        );
      })}
      <TopScorers matches={matches} />
    </div>
  );
}

function WatchTab({ matches, tz }) {
  const finished = matches
    .filter((m) => m.status === "FT" && m.homeScore != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <section style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: C.gold, margin: "0 0 12px" }}>📡 Watch Live</h2>
        <p style={{ fontSize: 15, color: C.dim, margin: "0 0 14px" }}>
          Links open in a new tab — availability depends on your country.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
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
                padding: "16px 18px", textDecoration: "none", color: C.text,
              }}
            >
              <span>
                <span style={{ fontSize: 18, fontWeight: 900, display: "block" }}>📺 {p.name}</span>
                <span style={{ fontSize: 14, color: C.dim }}>{p.note}</span>
              </span>
              <span style={{ fontSize: 20, color: C.green }}>→</span>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: C.gold, margin: "0 0 12px" }}>🎬 Highlights</h2>
        {finished.length === 0 ? (
          <EmptyState emoji="🎬" text="Highlights will appear here after the first games finish." />
        ) : (
          finished.map((m) => {
            const q = encodeURIComponent(`${m.home} vs ${m.away} World Cup 2026 highlights`);
            const homeWin = m.homeScore > m.awayScore;
            const awayWin = m.awayScore > m.homeScore;
            return (
              <div key={m.id} className="wc-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
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
                    style={{ fontSize: 14, fontWeight: 800, color: "#fff", background: "#ff0033", borderRadius: 10, padding: "9px 14px", textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    ▶ Highlights
                  </a>
                </div>
                <div style={{ fontSize: 13, color: C.dim, marginTop: 7 }}>
                  {m.group ? `Group ${m.group}` : "Knockout"} · {dayHeader(m.date, tz)} · 📍 {m.venue}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function PlayerProfile({ player, team, matches, onBack }) {
  // Derive tournament stats from match data
  const goals = [], cards = [], appearances = new Set();
  for (const m of matches) {
    const side = m.home === team ? "home" : m.away === team ? "away" : null;
    if (!side) continue;
    if (m.status === "FT" || m.status === "LIVE" || m.status === "HT") {
      appearances.add(m.id);
    }
    for (const g of m.goals || []) {
      if (g.side === side && g.player === player.shortName) goals.push({ ...g, m });
    }
    for (const c of m.cards || []) {
      if (c.side === side && c.player === player.shortName) cards.push({ ...c, m });
    }
  }

  const posColor = { GK: "#f59e0b", DEF: "#3b82f6", MID: "#22c55e", FWD: "#ef4444" };
  const formatDOB = (dob) => {
    if (!dob) return null;
    const [y, m, d] = dob.split("-");
    return `${d}/${m}/${y}`;
  };

  const StatBox = ({ label, value }) => (
    <div style={{ flex: 1, background: C.card2, borderRadius: 12, padding: "14px 10px", textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 900, color: C.text }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );

  const InfoRow = ({ label, value }) => value ? (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${C.border}22` }}>
      <span style={{ fontSize: 13, color: C.dim, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{value}</span>
    </div>
  ) : null;

  return (
    <div>
      <button
        onClick={onBack}
        className="wc-btn"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 800, color: C.text, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "9px 16px", marginBottom: 18, cursor: "pointer" }}
      >
        ← {team}
      </button>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
        <div style={{ position: "relative", display: "inline-block", marginBottom: 12 }}>
          <img
            src={`https://a.espncdn.com/i/headshots/soccer/players/full/${player.id}.png`}
            alt={player.name}
            onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "inline-flex"; }}
            style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover", objectPosition: "top", border: `2px solid ${C.border}`, display: "block" }}
          />
          <div style={{ width: 90, height: 90, borderRadius: "50%", background: C.card2, border: `2px solid ${C.border}`, display: "none", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, color: C.dim }}>
            {player.jersey ?? "?"}
          </div>
          {player.jersey != null && (
            <span style={{ position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: "50%", background: C.card, border: `1px solid ${C.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: C.text }}>
              {player.jersey}
            </span>
          )}
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 8px" }}>{player.name}</h2>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {player.pos && (
            <span style={{ background: posColor[player.pos] + "22", color: posColor[player.pos], border: `1px solid ${posColor[player.pos]}44`, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 800 }}>
              {player.pos}
            </span>
          )}
          <span style={{ background: C.card2, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 800 }}>
            {flag(team)} {team}
          </span>
        </div>
      </div>

      {/* Tournament stats */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 900, color: C.gold, margin: "0 0 10px" }}>World Cup 2026</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <StatBox label="Goals" value={goals.filter(g => !g.og).length} />
          <StatBox label="Assists" value="—" />
          <StatBox label="Yellow" value={cards.filter(c => c.type === "yellow").length || "0"} />
          <StatBox label="Red" value={cards.filter(c => c.type === "red").length || "0"} />
        </div>
        {goals.length > 0 && (
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {goals.map((g, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>⚽ {g.og ? "Own Goal" : "Goal"} {g.pen ? "(pen)" : ""}</span>
                <span style={{ fontSize: 13, color: C.dim, fontWeight: 700 }}>{g.m.home} vs {g.m.away} · {g.minute}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bio */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 900, color: C.gold, margin: "0 0 10px" }}>Profile</h3>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "0 16px" }}>
          <InfoRow label="Club" value={player.club} />
          <InfoRow label="Nationality" value={player.citizenship || team} />
          <InfoRow label="Date of Birth" value={formatDOB(player.dob)} />
          <InfoRow label="Age" value={player.age ? `${player.age} years` : null} />
          <InfoRow label="Height" value={player.height} />
          <InfoRow label="Weight" value={player.weight} />
          <InfoRow label="Position" value={player.pos} />
          <InfoRow label="Jersey" value={player.jersey ? `#${player.jersey}` : null} />
        </div>
      </section>
    </div>
  );
}

const FAV_MAX = 3;

function TeamDetail({ team, matches, tz, onBack, favTeams, toggleFavTeam, predictions, onPredict, onOpenLive, onPlayerSelect }) {
  const teamMatches = useMemo(
    () => [...matches.filter((m) => m.home === team || m.away === team)].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [team, matches]
  );
  const group = teamMatches.find((m) => m.group)?.group;
  const standings = useMemo(() => computeStandings(matches), [matches]);
  const groupTable = group ? (standings[group] || []) : [];
  const anyPlayed = groupTable.some((r) => r.P > 0);

  const cell = { padding: "9px 7px", textAlign: "center", fontSize: 15, fontWeight: 700 };
  const head = { ...cell, fontSize: 12, color: C.dim, fontWeight: 800 };

  return (
    <div>
      <button
        onClick={onBack}
        className="wc-btn"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 800, color: C.text, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "9px 16px", marginBottom: 18, cursor: "pointer" }}
      >
        ← All Teams
      </button>

      <div style={{ textAlign: "center", padding: "8px 0 22px" }}>
        <div style={{ fontSize: 72, lineHeight: 1.1 }}>{flag(team)}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "10px 0 4px" }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{team}</h2>
          {(() => {
            const isStarred = favTeams.includes(team);
            const atCap = !isStarred && favTeams.length >= FAV_MAX;
            return (
              <button
                onClick={() => !atCap && toggleFavTeam(team)}
                title={isStarred ? "Remove from favourites" : atCap ? `Max ${FAV_MAX} favourites — remove one first` : "Add to favourites"}
                style={{ background: "none", border: "none", fontSize: 24, cursor: atCap ? "not-allowed" : "pointer", padding: 0, lineHeight: 1, opacity: atCap ? 0.35 : 1 }}
              >
                {isStarred ? "⭐" : "☆"}
              </button>
            );
          })()}
        </div>
        {group && <span style={{ fontSize: 15, fontWeight: 700, color: C.dim }}>Group {group}</span>}
      </div>

      {group && groupTable.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <h3 style={{ fontSize: 17, fontWeight: 900, color: C.gold, margin: "0 0 10px" }}>Group {group} Standings</h3>
          {anyPlayed ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.card2 }}>
                    <th style={{ ...head, textAlign: "left", paddingLeft: 12 }}>Team</th>
                    <th style={head}>P</th>
                    <th style={head} className="wc-hide-sm">W</th>
                    <th style={head} className="wc-hide-sm">D</th>
                    <th style={head} className="wc-hide-sm">L</th>
                    <th style={head}>GD</th>
                    <th style={{ ...head, color: C.green }}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {groupTable.map((r, i) => {
                    const isMe = r.team === team;
                    return (
                      <tr key={r.team} style={{ borderTop: `1px solid ${C.border}`, background: isMe ? "rgba(34,197,94,0.14)" : i < 2 ? "rgba(34,197,94,0.05)" : "transparent" }}>
                        <td style={{ ...cell, textAlign: "left", paddingLeft: 12, fontWeight: isMe ? 900 : 700, color: isMe ? C.green : C.text }}>
                          <span style={{ marginRight: 7 }}>{flag(r.team)}</span>{r.team}
                          {i < 2 && <span style={{ marginLeft: 7, fontSize: 11, color: C.green }}>✓ADV</span>}
                        </td>
                        <td style={{ ...cell, fontWeight: isMe ? 900 : 700 }}>{r.P}</td>
                        <td style={{ ...cell }} className="wc-hide-sm">{r.W}</td>
                        <td style={{ ...cell }} className="wc-hide-sm">{r.D}</td>
                        <td style={{ ...cell }} className="wc-hide-sm">{r.L}</td>
                        <td style={{ ...cell }}>{r.GD > 0 ? `+${r.GD}` : r.GD}</td>
                        <td style={{ ...cell, color: C.green, fontWeight: 900 }}>{r.Pts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ fontSize: 15, color: C.dim, margin: 0 }}>Standings will appear once group matches kick off.</p>
          )}
        </section>
      )}

      {(() => {
        // Aggregate scorers and cards from all this team's matches
        const scorers = {}, yellows = {}, reds = {};
        for (const m of teamMatches) {
          const side = m.home === team ? "home" : "away";
          for (const g of m.goals || []) {
            if (g.side === side && !g.og) {
              scorers[g.player] = (scorers[g.player] || 0) + 1;
            }
          }
          for (const c of m.cards || []) {
            if (c.side === side) {
              if (c.type === "yellow") yellows[c.player] = (yellows[c.player] || 0) + 1;
              else reds[c.player] = (reds[c.player] || 0) + 1;
            }
          }
        }
        const scorerRows = Object.entries(scorers).sort((a, b) => b[1] - a[1]);
        const cardPlayers = Array.from(new Set([...Object.keys(yellows), ...Object.keys(reds)])).sort();
        if (!scorerRows.length && !cardPlayers.length) return null;
        return (
          <section style={{ marginBottom: 26 }}>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: C.gold, margin: "0 0 12px" }}>Tournament Performance</h3>
            <div style={{ display: "grid", gap: 12 }}>
              {scorerRows.length > 0 && (
                <EventSection
                  icon="⚽" title="Goals Scored"
                  rows={scorerRows.map(([player, count]) => ({
                    flag: flag(team),
                    label: player,
                    minute: `${count} goal${count > 1 ? "s" : ""}`,
                  }))}
                />
              )}
              {cardPlayers.length > 0 && (
                <EventSection
                  icon="🟨" iconBg="rgba(251,191,36,0.15)" title="Discipline"
                  rows={cardPlayers.map((player) => {
                    const y = yellows[player] || 0;
                    const r = reds[player] || 0;
                    const parts = [];
                    if (y) parts.push(`🟨×${y}`);
                    if (r) parts.push(`🟥×${r}`);
                    return { flag: flag(team), label: player, minute: parts.join(" ") };
                  })}
                />
              )}
            </div>
          </section>
        );
      })()}

      {(() => {
        const squad = rostersData.rosters?.[team];
        if (!squad?.length) return null;
        const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
        squad.forEach((p) => { if (byPos[p.pos]) byPos[p.pos].push(p); else byPos.FWD.push(p); });
        const posLabel = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
        return (
          <section style={{ marginBottom: 26 }}>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: C.gold, margin: "0 0 12px" }}>Squad</h3>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
              {Object.entries(byPos).map(([pos, players]) =>
                players.length === 0 ? null : (
                  <div key={pos}>
                    <div style={{ background: C.card2, padding: "6px 14px", fontSize: 11, fontWeight: 900, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>
                      {posLabel[pos]}
                    </div>
                    {players.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => onPlayerSelect(p)}
                        className="wc-btn"
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i === 0 ? `1px solid ${C.border}` : `1px solid ${C.border}22`, background: "none", border: "none", borderTop: i === 0 ? `1px solid ${C.border}` : `1px solid ${C.border}22`, color: C.text, cursor: "pointer", textAlign: "left" }}
                      >
                        <span style={{ width: 24, textAlign: "center", fontSize: 13, fontWeight: 800, color: C.dim, flexShrink: 0 }}>{p.jersey ?? "—"}</span>
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{p.name}</span>
                        {p.club && <span style={{ fontSize: 12, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{p.club}</span>}
                        <span style={{ fontSize: 13, color: C.dim, flexShrink: 0 }}>›</span>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          </section>
        );
      })()}

      <section>
        <h3 style={{ fontSize: 17, fontWeight: 900, color: C.gold, margin: "0 0 12px" }}>Fixtures &amp; Results</h3>
        {teamMatches.length === 0 && <p style={{ fontSize: 15, color: C.dim }}>No fixtures found.</p>}
        {(() => {
          const sections = [];
          let curKey = null;
          for (const m of teamMatches) {
            const k = dateKey(m.date, tz);
            if (k !== curKey) { curKey = k; sections.push({ key: k, label: dayHeader(m.date, tz), items: [] }); }
            sections[sections.length - 1].items.push(m);
          }
          return sections.map((sec) => (
            <div key={sec.key} style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: C.dim, margin: "0 0 8px" }}>{sec.label}</p>
              {sec.items.map((m) =>
                m.status === "LIVE" || m.status === "HT" ? (
                  <LiveCard key={m.id} m={m} tz={tz} onOpen={onOpenLive} />
                ) : m.status === "FT" ? (
                  <ResultCard key={m.id} m={m} tz={tz} prediction={predictions?.[m.id]} />
                ) : (
                  <MatchCard key={m.id} m={m} tz={tz} prediction={predictions?.[m.id]} onPredict={onPredict} />
                )
              )}
            </div>
          ));
        })()}
      </section>
    </div>
  );
}

function TeamsTab({ matches, tz, favTeams, toggleFavTeam, predictions, onPredict, onOpenLive }) {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [search, setSearch] = useState("");
  const lpTimer = React.useRef(null);
  const lpFired = React.useRef(false);

  const startLP = (team) => {
    lpFired.current = false;
    lpTimer.current = setTimeout(() => {
      lpFired.current = true;
      toggleFavTeam(team);
      navigator.vibrate?.(60);
    }, 500);
  };
  const cancelLP = () => clearTimeout(lpTimer.current);
  const handleClick = (e, team) => {
    if (lpFired.current) { e.preventDefault(); return; }
    setSelectedTeam(team);
  };

  const allTeams = useMemo(() => {
    const isPlaceholder = (name) => /Group [A-Z]|Winner|Place|Loser/i.test(name);
    const set = new Set();
    for (const m of matches) {
      if (!isPlaceholder(m.home)) set.add(m.home);
      if (!isPlaceholder(m.away)) set.add(m.away);
    }
    return Array.from(set).sort((a, b) => {
      const aFav = favTeams.includes(a), bFav = favTeams.includes(b);
      if (aFav !== bFav) return aFav ? -1 : 1;
      return a.localeCompare(b);
    });
  }, [matches, favTeams]);

  const filtered = search ? allTeams.filter((t) => t.toLowerCase().includes(search.toLowerCase())) : allTeams;

  if (selectedPlayer && selectedTeam) {
    return <PlayerProfile player={selectedPlayer} team={selectedTeam} matches={matches} onBack={() => setSelectedPlayer(null)} />;
  }

  if (selectedTeam) {
    return <TeamDetail team={selectedTeam} matches={matches} tz={tz} onBack={() => setSelectedTeam(null)} favTeams={favTeams} toggleFavTeam={toggleFavTeam} predictions={predictions} onPredict={onPredict} onOpenLive={onOpenLive} onPlayerSelect={setSelectedPlayer} />;
  }

  return (
    <div>
      <div className="wc-sticky" style={{ background: C.bg, paddingBottom: 12, marginBottom: 4 }}>
        <input
          type="search"
          placeholder="Search team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 17, fontWeight: 600,
            color: C.text, background: C.card, border: `2px solid ${C.border}`,
            borderRadius: 12, padding: "12px 14px", outline: "none",
          }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        {filtered.map((team) => {
          const starred = favTeams.includes(team);
          return (
            <button
              key={team}
              onClick={(e) => handleClick(e, team)}
              onTouchStart={() => startLP(team)}
              onTouchEnd={cancelLP}
              onTouchMove={cancelLP}
              onContextMenu={(e) => { e.preventDefault(); toggleFavTeam(team); }}
              className="wc-btn"
              style={{
                position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 8, padding: "16px 10px",
                background: starred ? "rgba(251,191,36,0.07)" : C.card,
                border: starred ? `1px solid rgba(251,191,36,0.5)` : `1px solid ${C.border}`,
                borderRadius: 14, cursor: "pointer", color: C.text, textAlign: "center",
              }}
            >
              {starred && <span style={{ position: "absolute", top: 6, right: 8, fontSize: 14 }}>⭐</span>}
              <span style={{ fontSize: 42, lineHeight: 1 }}>{flag(team)}</span>
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{team}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p style={{ gridColumn: "1/-1", textAlign: "center", color: C.dim, fontSize: 16, padding: "32px 0" }}>
            No team found for "{search}"
          </p>
        )}
      </div>
    </div>
  );
}

const ROUND_DEFS = [
  { label: "Round of 32", count: 16 },
  { label: "Round of 16", count: 8 },
  { label: "Quarter-finals", count: 4 },
  { label: "Semi-finals", count: 2 },
  { label: "3rd Place Play-off", count: 1 },
  { label: "🏆 Final", count: 1 },
];

function BracketMatchCard({ m, tz }) {
  const hasScore = m.homeScore != null && m.awayScore != null;
  const homeWin = hasScore && m.status === "FT" && m.homeScore > m.awayScore;
  const awayWin = hasScore && m.status === "FT" && m.awayScore > m.homeScore;
  const s = STATUS[m.status] || STATUS.NS;
  const isKnown = (name) => FLAGS[name] != null;

  const teamRow = (team, score, win) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{flag(team)}</span>
      <span style={{ flex: 1, fontSize: 15, fontWeight: win ? 900 : 700, color: win ? C.gold : isKnown(team) ? C.text : C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {team}
      </span>
      {hasScore && (
        <span style={{ fontSize: 20, fontWeight: 900, color: win ? C.gold : C.text, minWidth: 20, textAlign: "right", flexShrink: 0 }}>
          {score}
        </span>
      )}
    </div>
  );

  return (
    <div style={{ background: C.card, border: `1px solid ${s.live ? "rgba(239,68,68,0.45)" : C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 12px", background: C.card2, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.dim }}>{dayHeader(m.date, tz)} · {timeLabel(m.date, tz)}</span>
        <span className={s.live ? "wc-live" : undefined} style={{ fontSize: 11, fontWeight: 800, color: s.color }}>
          {s.live ? "🔴 " : ""}{s.label}{s.live && m.clock ? ` ${m.clock}` : ""}
        </span>
      </div>
      <div style={{ borderBottom: `1px solid ${C.border}` }}>{teamRow(m.home, m.homeScore, homeWin)}</div>
      {teamRow(m.away, m.awayScore, awayWin)}
    </div>
  );
}

function BracketTab({ matches, tz }) {
  const knockout = useMemo(
    () => [...matches.filter((m) => !m.group)].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [matches]
  );

  if (!knockout.length) {
    return <EmptyState emoji="🏆" text="Knockout matches will appear here once the group stage is complete." />;
  }

  const rounds = [];
  let offset = 0;
  for (const { label, count } of ROUND_DEFS) {
    const rMatches = knockout.slice(offset, offset + count);
    if (rMatches.length) rounds.push({ label, matches: rMatches });
    offset += count;
  }

  return (
    <div>
      {rounds.map(({ label, matches: rMatches }) => (
        <section key={label} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 19, fontWeight: 900, color: C.gold, margin: "0 0 12px" }}>{label}</h2>
          <div style={{ display: "grid", gridTemplateColumns: rMatches.length >= 4 ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr", gap: 0 }}>
            {rMatches.map((m) => (
              <BracketMatchCard key={m.id} m={m} tz={tz} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const timerRef = React.useRef(null);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 300) {
        setVisible(true);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setVisible(false), 3000);
      } else {
        clearTimeout(timerRef.current);
        setVisible(false);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(timerRef.current); };
  }, []);

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Go to top"
      title="Back to top"
      style={{
        position: "fixed", left: 18, bottom: "calc(68px + env(safe-area-inset-bottom, 0px) + 12px)", width: 46, height: 46, borderRadius: "50%",
        border: `1px solid ${C.border}`, background: C.card2, color: C.text,
        fontSize: 22, fontWeight: 900, cursor: "pointer", zIndex: 210, lineHeight: 1,
        boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
        opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.3s ease",
      }}
    >
      ↑
    </button>
  );
}

const WA_FEEDBACK_URL =
  "https://wa.me/919845158656?text=" +
  encodeURIComponent("Feedback / suggestion for fifa.shammas.in:\n\n");

function FloatingActions({ onRefresh }) {
  const [open, setOpen] = useState(false);
  const timerRef = React.useRef(null);
  const firedRef = React.useRef(false);

  const startPress = () => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      setOpen(true);
    }, 500);
  };

  const endPress = () => {
    clearTimeout(timerRef.current);
    if (!firedRef.current) onRefresh();
  };

  const cancelPress = () => {
    clearTimeout(timerRef.current);
    firedRef.current = true;
  };

  const actions = [
    { label: "💬", title: "Send WhatsApp feedback", href: WA_FEEDBACK_URL, bg: "#25D366", color: "#fff" },
  ];

  return (
    <>
      {open && <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 209 }} />}
      <div style={{ position: "fixed", right: 18, bottom: "calc(68px + env(safe-area-inset-bottom, 0px) + 12px)", zIndex: 210, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        {open && actions.map((a) => (
          <a
            key={a.label}
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            title={a.title}
            onClick={() => setOpen(false)}
            style={{
              width: 50, height: 50, borderRadius: "50%", background: a.bg, color: a.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, textDecoration: "none",
              boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
              animation: "wcFabPop 0.18s ease",
            }}
          >
            {a.label}
          </a>
        ))}
        <button
          onTouchStart={startPress}
          onTouchEnd={endPress}
          onTouchMove={cancelPress}
          onMouseDown={startPress}
          onMouseUp={endPress}
          onMouseLeave={cancelPress}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={open ? "Close menu" : "Refresh · hold for more"}
          title="Tap to refresh · Hold for more options"
          className="wc-btn"
          style={{
            width: 56, height: 56, borderRadius: "50%", border: "none",
            background: open ? "#334155" : C.green,
            color: open ? C.text : "#06210f",
            fontSize: open ? 20 : 26, fontWeight: 900,
            boxShadow: "0 6px 22px rgba(0,0,0,0.55)",
            cursor: "pointer", lineHeight: 1,
            transition: "background 0.2s, color 0.2s",
            userSelect: "none", WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
        >
          {open ? "✕" : "↻"}
        </button>
      </div>
    </>
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
      <div>Built by Shammas Oliyath with Claude · fifa.shammas.in</div>
      <div style={{ marginTop: 4 }}>
        Data &amp; recaps powered by{" "}
        <a href="https://www.espn.com" target="_blank" rel="noopener noreferrer" style={{ color: C.dim, textDecoration: "underline" }}>
          ESPN
        </a>
      </div>
    </footer>
  );
}

/* ── Pull-to-refresh ─────────────────────────────────────────────── */
function PullToRefresh({ onRefresh }) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = React.useRef(null);
  const THRESHOLD = 72;

  useEffect(() => {
    const onTouchStart = (e) => {
      if (window.scrollY <= 5) startY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY <= 5) {
        setPullY(Math.min(delta * 0.45, THRESHOLD + 16));
      }
    };
    const onTouchEnd = async () => {
      if (pullY >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPullY(THRESHOLD);
        await onRefresh();
        setTimeout(() => { setRefreshing(false); setPullY(0); }, 600);
      } else {
        setPullY(0);
      }
      startY.current = null;
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pullY, refreshing, onRefresh]);

  if (pullY === 0 && !refreshing) return null;
  const ready = pullY >= THRESHOLD;
  return (
    <div style={{
      position: "fixed", top: `calc(env(safe-area-inset-top, 0px) + 8px)`, left: "50%",
      transform: `translateX(-50%) translateY(${pullY}px)`, zIndex: 300,
      width: 40, height: 40, borderRadius: "50%",
      background: C.card, border: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      transition: refreshing ? "none" : "transform 0.05s",
    }}>
      <span className={refreshing ? "wc-ptr-spinner" : ""} style={{ display: "inline-block", opacity: ready || refreshing ? 1 : 0.4 }}>
        {refreshing ? "↻" : ready ? "↑" : "↓"}
      </span>
    </div>
  );
}

/* ── Onboarding hints ────────────────────────────────────────────── */
const HINTS = [
  { emoji: "⛶",  title: "Fullscreen match view",   body: "Tap any live or completed match card to open the full stats, goals, and recap." },
  { emoji: "↓",  title: "Pull down to refresh",     body: "Pull down from the top of any page to get the latest scores instantly." },
  { emoji: "🔔", title: "Get goal notifications",   body: "Tap the 🔔 bell to enable push alerts for goals, kick-offs, and full time." },
  { emoji: "🏴", title: "Explore player profiles",  body: "Go to Teams → pick a squad → tap any player to see their tournament stats." },
];

function Onboarding() {
  const [step, setStep] = useLocalStorage("wc_onboarded", 0);
  if (step >= HINTS.length) return null;
  const h = HINTS[step];
  const isLast = step === HINTS.length - 1;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 16px" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "20px 20px 0 0", padding: "28px 24px", paddingBottom: `calc(24px + env(safe-area-inset-bottom, 0px))`, width: "100%", maxWidth: 500, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{h.emoji}</div>
        <h3 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 10px" }}>{h.title}</h3>
        <p style={{ fontSize: 15, color: C.dim, margin: "0 0 24px", lineHeight: 1.6 }}>{h.body}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
          {HINTS.map((_, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === step ? C.green : C.border }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep(HINTS.length)} className="wc-btn" style={{ flex: 1, padding: "13px", borderRadius: 12, border: `1px solid ${C.border}`, background: "none", color: C.dim, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Skip all
          </button>
          <button onClick={() => setStep(step + 1)} className="wc-btn" style={{ flex: 2, padding: "13px", borderRadius: 12, border: "none", background: C.green, color: "#06210f", fontSize: 15, fontWeight: 900, cursor: "pointer" }}>
            {isLast ? "Let's go! ⚽" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InstallPrompt() {
  const [dismissed, setDismissed] = useLocalStorage("wc_install_dismissed", false);
  if (dismissed) return null;
  const isInstalled = window.matchMedia?.("(display-mode: standalone)").matches || !!navigator.standalone;
  if (isInstalled) return null;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (!isMobile) return null;
  return (
    <div style={{ background: "#1e293b", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 22, flexShrink: 0 }}>📲</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>Add to home screen for live alerts & offline access</span>
      <button onClick={() => setDismissed(true)} style={{ background: "none", border: "none", color: C.dim, fontSize: 18, cursor: "pointer", flexShrink: 0, padding: "0 4px" }}>✕</button>
    </div>
  );
}

/* ------------------------------ App -------------------------------- */

export default function App() {
  const [tab, setTab] = useState("matches");
  const [tz, setTz] = useState("local");
  const [favTeams, setFavTeams] = useLocalStorage("wc_fav_teams", []);
  const toggleFavTeam = (team) => {
    const arr = Array.isArray(favTeams) ? favTeams : [];
    if (arr.includes(team)) setFavTeams(arr.filter((t) => t !== team));
    else if (arr.length < FAV_MAX) setFavTeams([...arr, team]);
  };
  const [predictions, setPredictions] = useLocalStorage("wc_predictions", {});
  const [goalAlerts, setGoalAlerts] = useState([]);
  const [liveModal, setLiveModal] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [notifOn] = useLocalStorage("wc_notif_on", false);
  const [matchesState, setMatchesState] = useState(matchesData);
  const matches = matchesState.matches || [];

  const refreshMatches = useCallback(async () => {
    try {
      const res = await fetch(`./src/data/matches.json?t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      setMatchesState(data);
      // Keep liveModal in sync with refreshed data.
      setLiveModal((prev) => {
        if (!prev) return prev;
        const updated = (data.matches || []).find((m) => m.id === prev.id);
        return updated || prev;
      });
    } catch { /* silently ignore network errors */ }
  }, []);

  // Restore live modal after page load (sessionStorage survives soft navigation).
  useEffect(() => {
    const savedId = sessionStorage.getItem("wc_live_modal");
    if (savedId) {
      const m = matches.find((m) => m.id === savedId);
      if (m && (m.status === "LIVE" || m.status === "HT")) setLiveModal(m);
      else sessionStorage.removeItem("wc_live_modal");
    }
  }, []);

  const openLiveModal = (m) => { sessionStorage.setItem("wc_live_modal", m.id); setLiveModal(m); };
  const closeLiveModal = () => { sessionStorage.removeItem("wc_live_modal"); setLiveModal(null); };

  // Detect score changes vs the last visit and queue toasts + browser notifications.
  useEffect(() => {
    const prev = (() => { try { return JSON.parse(localStorage.getItem("wc_prev_scores")); } catch { return null; } })();
    const notifEnabled = (() => { try { return JSON.parse(localStorage.getItem("wc_notif_on")); } catch { return false; } })();
    const prefs = {
      goals:   (() => { try { return JSON.parse(localStorage.getItem("wc_notif_goals"))   ?? true;  } catch { return true;  } })(),
      kickoff: (() => { try { return JSON.parse(localStorage.getItem("wc_notif_kickoff")) ?? true;  } catch { return true;  } })(),
      ft:      (() => { try { return JSON.parse(localStorage.getItem("wc_notif_ft"))      ?? true;  } catch { return true;  } })(),
      cards:   (() => { try { return JSON.parse(localStorage.getItem("wc_notif_cards"))   ?? false; } catch { return false; } })(),
      favOnly: (() => { try { return JSON.parse(localStorage.getItem("wc_notif_favonly")) ?? false; } catch { return false; } })(),
    };
    const favTeamsStored = (() => { try { return JSON.parse(localStorage.getItem("wc_fav_teams")) ?? []; } catch { return []; } })();

    const canNotif = notifEnabled && typeof Notification !== "undefined" && Notification.permission === "granted";
    const sendNotif = (title, body) => {
      if (canNotif) new Notification(title, { body, icon: "./apple-touch-icon.png", badge: "./favicon-32.png" });
    };

    const current = {};
    const alerts = [];

    for (const m of matches) {
      const redCards = (m.cards || []).filter((c) => c.type === "red").length;
      current[m.id] = { h: m.homeScore, a: m.awayScore, status: m.status, redCards };

      if (!prev) continue;
      const p = prev[m.id];
      if (!p) continue;

      const isFav = favTeamsStored.length === 0 || !prefs.favOnly ||
        favTeamsStored.includes(m.home) || favTeamsStored.includes(m.away);
      if (!isFav) continue;

      const label = `${flag(m.home)} ${m.home} vs ${m.away} ${flag(m.away)}`;

      // Goals
      if (m.homeScore != null && m.awayScore != null && p.h != null) {
        if (m.homeScore !== p.h || m.awayScore !== p.a) {
          const homeUp = m.homeScore > p.h, awayUp = m.awayScore > p.a;
          const headline = homeUp && !awayUp ? `GOAL — ${m.home}!`
            : !homeUp && awayUp ? `GOAL — ${m.away}!`
            : "Score update";
          alerts.push({ ...m, headline });
          if (prefs.goals) sendNotif(`⚽ ${headline}`, `${label}  ${m.homeScore}–${m.awayScore}`);
        }
      }

      // Kick-off
      if (p.status === "NS" && (m.status === "LIVE" || m.status === "HT")) {
        if (prefs.kickoff) sendNotif(`🟢 Kick-off! ${m.home} vs ${m.away}`, label);
      }

      // Full time
      if ((p.status === "LIVE" || p.status === "HT") && m.status === "FT") {
        if (prefs.ft) sendNotif(`✅ Full Time: ${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`, label);
      }

      // Red cards
      if (redCards > (p.redCards || 0)) {
        const newReds = redCards - (p.redCards || 0);
        if (prefs.cards) sendNotif(`🟥 Red card${newReds > 1 ? "s" : ""}`, label);
      }
    }

    try { localStorage.setItem("wc_prev_scores", JSON.stringify(current)); } catch {}
    if (alerts.length) setGoalAlerts(alerts);
  }, []);

  const onPredict = (matchId, pred) => {
    const next = { ...predictions };
    if (pred === null) delete next[matchId]; else next[matchId] = pred;
    setPredictions(next);
  };

  const onRefresh = useCallback(() => { window.location.reload(); }, []);

  const hasLive = matches.some((m) => m.status === "LIVE" || m.status === "HT");

  // Offline detection
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Swipe left/right to change tabs + slide direction tracking
  const tabIds = TAB_ITEMS.map((t) => t.id);
  const [slideDir, setSlideDir] = useState("left");
  const swipeStart = React.useRef(null);
  const onSwipeTouchStart = (e) => { swipeStart.current = e.touches[0].clientX; };
  const onSwipeTouchEnd = (e) => {
    if (swipeStart.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) < 50) return;
    const cur = tabIds.indexOf(tab);
    if (dx < 0 && cur < tabIds.length - 1) { setSlideDir("left");  setTab(tabIds[cur + 1]); }
    if (dx > 0 && cur > 0)                 { setSlideDir("right"); setTab(tabIds[cur - 1]); }
  };

  const changeTab = (id) => {
    const cur = tabIds.indexOf(tab);
    const next = tabIds.indexOf(id);
    setSlideDir(next > cur ? "left" : "right");
    setTab(id);
  };

  return (
    <div
      style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "16px 16px 0" }}
      onTouchStart={onSwipeTouchStart}
      onTouchEnd={onSwipeTouchEnd}
    >
      <GlobalStyles />
      <GoalToast alerts={goalAlerts} />
      <PullToRefresh onRefresh={refreshMatches} />
      <Onboarding />
      {liveModal && <LiveMatchModal m={liveModal} onClose={closeLiveModal} onRefresh={refreshMatches} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      <div className="wc-wrap">
        <Header lastUpdated={matchesData.lastUpdated} tz={tz} setTz={setTz} onSettings={() => setShowSettings(true)} notifOn={notifOn} />
        {!isOnline && (
          <div style={{ background: "#78350f", color: "#fef3c7", fontSize: 13, fontWeight: 700, textAlign: "center", padding: "8px 16px", borderRadius: 10, marginBottom: 12 }}>
            📡 No connection — showing cached data
          </div>
        )}
        <InstallPrompt />
        <LiveNowBanner matches={matches} onGoToMatches={() => changeTab("matches")} />

        <div key={tab} className={`wc-slide-${slideDir}`}>
          {matches.length === 0 ? (
            <EmptyState emoji="📭" text="No match data found. Run the scraper to populate scores." />
          ) : tab === "matches" ? (
            <MatchesTab matches={matches} tz={tz} favTeams={favTeams} predictions={predictions} onPredict={onPredict} onOpenLive={openLiveModal} onGoToTeams={() => changeTab("teams")} onGoToStandings={() => changeTab("standings")} />
          ) : tab === "teams" ? (
            <TeamsTab matches={matches} tz={tz} favTeams={favTeams} toggleFavTeam={toggleFavTeam} predictions={predictions} onPredict={onPredict} onOpenLive={openLiveModal} />
          ) : tab === "schedule" ? (
            <ScheduleTab matches={matches} tz={tz} onMatchClick={(m) => {
              changeTab("matches");
              setTimeout(() => {
                const el = document.getElementById(`match-${m.id}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 200);
            }} />
          ) : tab === "standings" ? (
            <StandingsTab matches={matches} />
          ) : tab === "bracket" ? (
            <BracketTab matches={matches} tz={tz} />
          ) : (
            <WatchTab matches={matches} tz={tz} />
          )}
          <Footer source={matchesData.source} />
        </div>
      </div>

      <Tabs tab={tab} setTab={changeTab} hasLive={hasLive} />
      <ScrollToTop />
      <FloatingActions onRefresh={onRefresh} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
