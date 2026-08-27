/**
 * Libera Analysts — quote updater (Cloudflare Worker)
 *
 * A JavaScript port of tools/fetch_quotes.py. It runs on Cloudflare's cron
 * every 5 minutes, writes the built payloads to KV, and serves them at
 * /data/quotes.json and /data/series.json.
 *
 * Endpoints
 *   GET /data/quotes.json   the tape + all quotes
 *   GET /data/series.json   intraday paths per symbol
 *   GET /data/health        symbol count, age, failures — one URL to check
 *   POST /data/refresh      force a refresh (needs ?token=REFRESH_TOKEN)
 *
 * The Python fetcher stays as the local/offline path; both write the same
 * shape, so the site does not care which one produced the file.
 */

const SERIES_POINTS = 90;
const SPARK_POINTS = 24;

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/";
const SPOT_API = "https://api.gold-api.com/price/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

const KEY_QUOTES = "quotes";
const KEY_SERIES = "series";

// id, name, assetClass, decimals, inTape, unit, source
// source: "^GSPC" (Yahoo) or "spot:XAU" (gold-api)
const SOURCES = [
  ["SPX",    "S&P 500",       "equities", 2, true,  "",        "^GSPC"],
  ["NDX",    "Nasdaq 100",    "equities", 2, true,  "",        "^NDX"],
  ["US30",   "Dow Jones",     "equities", 2, true,  "",        "^DJI"],
  ["NIKKEI", "Nikkei 225",    "equities", 2, false, "",        "^N225"],
  ["SET",    "SET Index",     "equities", 2, true,  "",        "^SET.BK"],
  ["NVDA",   "NVIDIA",        "equities", 2, false, "USD",     "NVDA"],

  ["EURUSD", "EUR/USD",       "forex",    4, true,  "",        "EURUSD=X"],
  ["USDJPY", "USD/JPY",       "forex",    2, false, "",        "JPY=X"],
  ["GBPUSD", "GBP/USD",       "forex",    4, false, "",        "GBPUSD=X"],
  ["USDTHB", "USD/THB",       "forex",    2, true,  "",        "THB=X"],

  ["BTCUSD", "BTC/USD",       "crypto",   0, true,  "USD",     "BTC-USD"],
  ["ETHUSD", "ETH/USD",       "crypto",   2, false, "USD",     "ETH-USD"],
  ["SOLUSD", "SOL/USD",       "crypto",   2, false, "USD",     "SOL-USD"],
  ["XRPUSD", "XRP/USD",       "crypto",   3, false, "USD",     "XRP-USD"],

  ["XAUUSD", "Gold Spot",     "commodities", 2, true,  "USD/oz",  "spot:XAU"],
  ["XAGUSD", "Silver Spot",   "commodities", 2, false, "USD/oz",  "spot:XAG"],
  ["XPTUSD", "Platinum Spot", "commodities", 2, false, "USD/oz",  "spot:XPT"],
  ["COPPER", "Copper Spot",   "commodities", 4, false, "USD/lb",  "spot:HG"],

  // No free spot feed exists for crude; the world quotes WTI off the
  // front-month contract, so the row is named for what it actually is.
  ["WTI", "WTI Crude (front-month)", "commodities", 2, true, "USD/bbl", "CL=F"],
];

const ALL_IDS = SOURCES.map((s) => s[0]);
const ALL_TAPE = SOURCES.filter((s) => s[4]).map((s) => s[0]);

/* ------------------------------------------------------------- helpers -- */

const round = (v, d) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};

/** GET with a short retry: cloud egress hits transient DNS/5xx blips. */
async function getJSON(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, cf: { cacheTtl: 0 } });
      if (res.status === 429) throw new Error("rate limited");
      if (!res.ok) {
        // 4xx will not fix itself; only retry server-side failures.
        if (res.status < 500) throw new Error(`HTTP ${res.status}`);
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return await res.json();
      }
    } catch (err) {
      lastErr = err;
      if (String(err.message).includes("HTTP 4") || String(err.message) === "rate limited") throw err;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw lastErr || new Error("fetch failed");
}

function downsample(points, target) {
  if (points.length <= target) return points.slice();
  const step = points.length / target;
  const out = [];
  for (let i = 0; i < target; i++) out.push(points[Math.floor(i * step)]);
  out[out.length - 1] = points[points.length - 1];
  return out;
}

/* -------------------------------------------------------------- feeds --- */

/** Yahoo chart: current price, previous close, and the real intraday path. */
async function fetchYahoo(symbol) {
  const url = `${YAHOO_CHART}${encodeURIComponent(symbol)}?interval=5m&range=1d`;
  const payload = await getJSON(url);

  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(payload?.chart?.error?.description || "empty chart");

  const meta = result.meta || {};
  const last = meta.regularMarketPrice;
  if (last === undefined || last === null) throw new Error("no regularMarketPrice");

  const prev = meta.chartPreviousClose ?? meta.previousClose ?? last;

  const raw = result.indicators?.quote?.[0]?.close || [];
  const closes = raw.filter((c) => typeof c === "number" && isFinite(c));

  const ts = meta.regularMarketTime;
  const stamp = typeof ts === "number"
    ? new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 19)
    : null;

  return { last: Number(last), prev: Number(prev), stamp, series: closes };
}

/** gold-api: spot metals. Current price only — no previous close. */
async function fetchSpot(code) {
  const payload = await getJSON(`${SPOT_API}${encodeURIComponent(code)}`);
  if (payload?.price === undefined) throw new Error("no price in spot response");
  return {
    last: Number(payload.price),
    prev: null,
    stamp: String(payload.updatedAt || "").replace("T", " ").replace("Z", "") || null,
    series: [],
  };
}

/* ------------------------------------------------------------- refresh -- */

async function refresh(env) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const prevDoc = JSON.parse((await env.QUOTES.get(KEY_QUOTES)) || '{"quotes":[]}');
  const seriesDoc = JSON.parse((await env.QUOTES.get(KEY_SERIES)) || '{"series":{}}');
  const prevBySym = new Map((prevDoc.quotes || []).map((q) => [q.symbol, q]));

  const quotes = [];
  const failures = [];

  for (const [sym, name, cls, dec, inTape, unit, source] of SOURCES) {
    let old = prevBySym.get(sym) || {};

    // A changed unit means the stored history is not comparable (copper per
    // ton vs per pound would read as a -99% crash). Drop it instead.
    if (old.unit !== undefined && old.unit !== unit) old = {};

    let feed;
    try {
      feed = source.startsWith("spot:")
        ? await fetchSpot(source.slice(5))
        : await fetchYahoo(source);
    } catch (err) {
      // Keep the last good price and flag it — never blank a row.
      failures.push(`${sym}: ${err.message}`);
      if (old.symbol) quotes.push({ ...old, stale: true });
      continue;
    }

    const last = feed.last;
    let prevClose = feed.prev;
    let changeKnown = true;
    let basis = "prevClose";

    if (prevClose === null) {
      if (old.sessionDate === today && old.prevClose !== undefined) {
        // Same day: keep the reference already set, so the percentage does
        // not shift around during the session.
        prevClose = Number(old.prevClose);
        changeKnown = Boolean(old.changeKnown);
        basis = old.changeBasis || "session";
      } else if (old.last !== undefined) {
        // New UTC day: yesterday's final price IS the previous close.
        prevClose = Number(old.last);
        basis = "prevClose";
      } else {
        prevClose = last;
        changeKnown = false;
        basis = "session";
      }
      // Only claim ignorance when there is genuinely nothing to compare to.
      changeKnown = prevClose !== last;
    }

    const change = last - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    let points;
    if (feed.series.length >= 2) {
      points = downsample(feed.series, SERIES_POINTS).map((p) => round(p, dec));
      if (points[points.length - 1] !== round(last, dec)) points.push(round(last, dec));
    } else {
      points = (seriesDoc.series?.[sym]?.points || []).slice();
      if (!points.length) points = [round(prevClose, dec)];
      points.push(round(last, dec));
      points = points.slice(-SERIES_POINTS);
    }

    seriesDoc.series = seriesDoc.series || {};
    seriesDoc.series[sym] = { symbol: sym, range: "1D", points };

    const sessionOpen = old.sessionDate === today && old.sessionOpen !== undefined
      ? Number(old.sessionOpen)
      : round(prevClose, dec);

    quotes.push({
      symbol: sym, name, assetClass: cls, decimals: dec,
      last: round(last, dec),
      prevClose: round(prevClose, dec),
      change: round(change, dec),
      changePct: round(changePct, 2),
      open: round(points[0], dec),
      high: round(Math.max(...points), dec),
      low: round(Math.min(...points), dec),
      spark: points.slice(-SPARK_POINTS),
      inTape,
      unit,
      changeKnown,
      changeBasis: basis,
      sessionOpen,
      sessionDate: today,
      sourceTime: feed.stamp,
      stale: false,
    });
  }

  if (!quotes.length) throw new Error("every symbol failed — keeping the stored payload");

  // Merge, never replace: anything not fetched keeps its previous values.
  const fetched = new Set(quotes.map((q) => q.symbol));
  const carried = (prevDoc.quotes || []).filter((q) => !fetched.has(q.symbol));
  const merged = [...quotes, ...carried].sort(
    (a, b) => (ALL_IDS.indexOf(a.symbol) + 1 || 999) - (ALL_IDS.indexOf(b.symbol) + 1 || 999)
  );

  const stamp = now.toISOString().replace(/\.\d+Z$/, "+00:00");

  const quotesDoc = {
    asOf: stamp,
    source: "Yahoo Finance + gold-api",
    delayedMinutes: 15,
    refreshSeconds: 300,
    partial: failures.length > 0,
    tape: ALL_TAPE,
    quotes: merged,
  };
  seriesDoc.asOf = stamp;

  await env.QUOTES.put(KEY_QUOTES, JSON.stringify(quotesDoc));
  await env.QUOTES.put(KEY_SERIES, JSON.stringify(seriesDoc));

  return { updated: quotes.length - failures.length, total: SOURCES.length, failures, asOf: stamp };
}

/* --------------------------------------------------------------- http --- */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Rewritten every 5 minutes: a cached copy would freeze prices for everyone.
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "Access-Control-Allow-Origin": "*",
};

async function serve(env, key, label) {
  const body = await env.QUOTES.get(key);
  if (!body) {
    return new Response(
      JSON.stringify({ error: `${label} ยังไม่ถูกสร้าง — รอ cron รอบแรก หรือเรียก /data/refresh` }),
      { status: 503, headers: JSON_HEADERS }
    );
  }
  return new Response(body, { headers: JSON_HEADERS });
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      refresh(env).then(
        (r) => console.log(`refreshed ${r.updated}/${r.total}`, r.failures),
        (e) => console.error("refresh failed:", e.message)
      )
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/data/quotes.json") return serve(env, KEY_QUOTES, "quotes.json");
    if (path === "/data/series.json") return serve(env, KEY_SERIES, "series.json");

    if (path === "/data/health") {
      const body = await env.QUOTES.get(KEY_QUOTES);
      if (!body) return new Response(JSON.stringify({ ok: false, reason: "no data yet" }), { status: 503, headers: JSON_HEADERS });
      const doc = JSON.parse(body);
      const ageMin = (Date.now() - new Date(doc.asOf).getTime()) / 60000;
      return new Response(JSON.stringify({
        ok: ageMin < 20 && !doc.partial,
        asOf: doc.asOf,
        ageMinutes: Math.round(ageMin * 10) / 10,
        symbols: doc.quotes.length,
        stale: doc.quotes.filter((q) => q.stale).map((q) => q.symbol),
        partial: doc.partial,
      }, null, 2), { headers: JSON_HEADERS });
    }

    // Manual refresh, so the first run does not have to wait for the cron.
    if (path === "/data/refresh") {
      if (!env.REFRESH_TOKEN || url.searchParams.get("token") !== env.REFRESH_TOKEN) {
        return new Response(JSON.stringify({ error: "ต้องมี ?token=... ที่ตรงกับ REFRESH_TOKEN" }),
          { status: 401, headers: JSON_HEADERS });
      }
      try {
        const r = await refresh(env);
        return new Response(JSON.stringify(r, null, 2), { headers: JSON_HEADERS });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: JSON_HEADERS });
      }
    }

    return new Response("Libera Analysts quote worker — see /data/health", { status: 404 });
  },
};
