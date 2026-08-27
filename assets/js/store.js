/* ==========================================================================
   Libera Analysts — session, entitlements, and data access

   Entitlements are derived from the tier and gate BOTH the UI and (in
   production) the API. The masks and 🔒 marks in the UI are presentation
   only — never the enforcement boundary. The server must truncate the
   payload for a tier that cannot read it.
   ========================================================================== */

export const TIERS = { free: 0, pro: 1, exclusive: 2 };

export const TIER_LABEL = {
  free:      { text: 'สมาชิก FREE',       style: 'plain'  },
  pro:       { text: '★ สมาชิก PRO',       style: 'ink'    },
  exclusive: { text: '✦ สมาชิก EXCLUSIVE', style: 'accent' },
};

/* ------------------------------------------------------------- session -- */

const SESSION_KEY = 'libera-session';

const DEFAULT_SESSION = {
  user: { name: 'ธนกฤต ศรีสมบัติ', initials: 'ธน' },
  tier: 'free',
  locale: 'th',
};

export const session = loadSession();

function loadSession() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
  } catch { /* corrupt or unavailable — fall back to defaults */ }

  const tier = TIERS[saved.tier] !== undefined ? saved.tier : DEFAULT_SESSION.tier;
  return { ...DEFAULT_SESSION, ...saved, tier };
}

export function setTier(tier) {
  if (TIERS[tier] === undefined) return;
  session.tier = tier;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ tier, locale: session.locale }));
  } catch { /* private mode — the switch still applies for this page view */ }
  window.dispatchEvent(new CustomEvent('libera:tierchange', { detail: { tier } }));
}

/* -------------------------------------------------------- entitlements -- */

/**
 * Derived from the tier — never stored. Every gated surface asks this object,
 * so a tier change re-renders the whole page consistently.
 */
export function entitlements(tier = session.tier) {
  const level = TIERS[tier] ?? 0;
  return {
    tier,
    level,
    /** Content gating is per-item `requiredTier`, not per asset class. */
    canRead: (requiredTier = 'free') => level >= (TIERS[requiredTier] ?? 0),
    watchlistLimit: level >= TIERS.pro ? Infinity : 1,
    realtimeQuotes: level >= TIERS.exclusive,
    analystCalls:   level >= TIERS.exclusive,
    modelPortfolio: level >= TIERS.exclusive,
    liveQA:         level >= TIERS.exclusive,
    realtimeAlerts: level >= TIERS.pro,
    /** What the reader should be nudged toward next, if anything. */
    upgradeTarget: level >= TIERS.exclusive ? null : level >= TIERS.pro ? 'exclusive' : 'pro',
  };
}

export function tierBadgeText(requiredTier) {
  return { free: 'FREE', pro: 'PRO', exclusive: 'EXCLUSIVE' }[requiredTier] || 'FREE';
}

/* ------------------------------------------------------------ data i/o -- */

const cache = new Map();

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(path, { cache: 'no-store' }).then((res) => {
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  });
  cache.set(path, p);
  return p;
}

export const api = {
  quotes:   () => getJSON('./data/quotes.json'),
  series:   () => getJSON('./data/series.json'),
  articles: () => getJSON('./data/articles.json'),
  analysis: () => getJSON('./data/analysis.json'),
  desk:     () => getJSON('./data/desk.json'),
};

/** Quotes keyed by symbol, for the many places that look one up by name. */
export async function quoteMap() {
  const { quotes } = await api.quotes();
  return new Map(quotes.map((q) => [q.symbol, q]));
}

/* -------------------------------------------------------- live refresh -- */

const QUOTES_PATH = './data/quotes.json';
let pollTimer = null;

/**
 * Refetch quotes, bypassing the module cache, and tell the page about it.
 *
 * Emits `libera:quotesupdate` with the new doc, a symbol→quote map, and the
 * list of symbols whose price actually moved (so the tape can flash only
 * those). On failure the previous data is left in place and `libera:quotesstale`
 * is emitted instead — the page keeps the last good prices rather than blanking.
 */
export async function refreshQuotes() {
  const previous = cache.has(QUOTES_PATH) ? await cache.get(QUOTES_PATH) : null;

  let doc;
  try {
    const res = await fetch(`${QUOTES_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    doc = await res.json();
    if (!Array.isArray(doc.quotes) || !doc.quotes.length) throw new Error('empty payload');
  } catch (err) {
    window.dispatchEvent(new CustomEvent('libera:quotesstale', { detail: { error: err } }));
    return previous;
  }

  const changed = [];
  if (previous) {
    const before = new Map(previous.quotes.map((q) => [q.symbol, q.last]));
    for (const q of doc.quotes) {
      const was = before.get(q.symbol);
      if (was !== undefined && was !== q.last) {
        changed.push({ symbol: q.symbol, from: was, to: q.last });
      }
    }
  }

  cache.set(QUOTES_PATH, Promise.resolve(doc));
  const map = new Map(doc.quotes.map((q) => [q.symbol, q]));
  window.dispatchEvent(new CustomEvent('libera:quotesupdate', { detail: { doc, map, changed } }));
  return doc;
}

/**
 * Poll on the cadence the data file asks for (default 5 minutes).
 * Pauses while the tab is hidden and catches up on return, so a backgrounded
 * tab does not keep hitting the file for nobody.
 */
export function startQuotePolling(seconds) {
  stopQuotePolling();
  const period = Math.max(30, Number(seconds) || 300) * 1000;
  let lastRun = Date.now();

  const tick = async () => {
    if (document.hidden) return;
    lastRun = Date.now();
    await refreshQuotes();
  };

  pollTimer = setInterval(tick, period);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastRun >= period) tick();
  });

  return () => stopQuotePolling();
}

export function stopQuotePolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/* --------------------------------------------------------------- theme -- */

const THEME_KEY = 'libera-theme';

export function initTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) document.documentElement.dataset.theme = saved;
  } catch { /* ignore */ }
}

export function isDark() {
  const set = document.documentElement.dataset.theme;
  if (set) return set === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('libera:themechange', { detail: { theme: next } }));
  return next;
}
