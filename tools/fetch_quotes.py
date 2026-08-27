"""
Libera Analysts — live quote fetcher.

Rewrites data/quotes.json + data/series.json from a real market feed.

    python tools/fetch_quotes.py --once            # one refresh, then exit
    python tools/fetch_quotes.py                   # refresh every 5 minutes
    python tools/fetch_quotes.py --interval 900    # ...every 15 minutes
    python tools/fetch_quotes.py --symbols XAUUSD,BTCUSD   # a subset only

PROVIDERS
---------
yahoo (default)  No API key, no signup. Real index levels (^GSPC, ^SET.BK),
                 real previous closes, and a real intraday path per symbol.
                 Comfortably supports a 5-minute cadence.

alphavantage     Needs a key in config.local.json. Kept as a fallback; its
                 free tier is 25 requests/DAY, which cannot sustain 5-minute
                 polling, and it has no index quotes (only ETF proxies).

    python tools/fetch_quotes.py --provider alphavantage

⚠️  LICENSING — read before launching a paid site
--------------------------------------------------
Yahoo's quote endpoints are undocumented, and their terms do not permit
redistributing the data in a commercial product. That is fine for local
development and testing; it is NOT a licence to run a paid subscription
site on it. Before charging money on Liberatrade.com, move to a licensed
feed (Twelve Data, Polygon, Finnhub, EOD Historical Data, or a broker
feed). Only the `SOURCES` table below has to change — nothing else does.

SAFETY
------
A refresh MERGES into the existing files: symbols this run did not fetch
keep their previous values instead of being deleted. A symbol that fails
keeps its last good price and is marked `stale`, so the page never blanks.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

SERIES_POINTS = 90     # points kept per symbol for the full-size charts
SPARK_POINTS = 24      # points the tape sparkline reads
TIMEOUT = 20

YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/"
YAHOO_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
SPOT_API = "https://api.gold-api.com/price/"   # keyless spot metals
AV_BASE = "https://www.alphavantage.co/query"


# id, display name, asset class, decimals, in-tape, unit, yahoo symbol,
# alpha vantage endpoint (kind, args) or None
SOURCES = [
    ("SPX",    "S&P 500",        "equities", 2, True,  "",        "^GSPC",    ("stock", {"symbol": "SPY"})),
    ("NDX",    "Nasdaq 100",     "equities", 2, True,  "",        "^NDX",     ("stock", {"symbol": "QQQ"})),
    ("US30",   "Dow Jones",      "equities", 2, True,  "",        "^DJI",     ("stock", {"symbol": "DIA"})),
    ("NIKKEI", "Nikkei 225",     "equities", 2, False, "",        "^N225",    ("stock", {"symbol": "EWJ"})),
    ("SET",    "SET Index",      "equities", 2, True,  "",        "^SET.BK",  None),
    ("NVDA",   "NVIDIA",         "equities", 2, False, "USD",     "NVDA",     ("stock", {"symbol": "NVDA"})),

    ("EURUSD", "EUR/USD",        "forex",    4, True,  "",        "EURUSD=X", ("fx", {"from": "EUR", "to": "USD"})),
    ("USDJPY", "USD/JPY",        "forex",    2, False, "",        "JPY=X",    ("fx", {"from": "USD", "to": "JPY"})),
    ("GBPUSD", "GBP/USD",        "forex",    4, False, "",        "GBPUSD=X", ("fx", {"from": "GBP", "to": "USD"})),
    ("USDTHB", "USD/THB",        "forex",    2, True,  "",        "THB=X",    ("fx", {"from": "USD", "to": "THB"})),

    ("BTCUSD", "BTC/USD",        "crypto",   0, True,  "USD",     "BTC-USD",  ("fx", {"from": "BTC", "to": "USD"})),
    ("ETHUSD", "ETH/USD",        "crypto",   2, False, "USD",     "ETH-USD",  ("fx", {"from": "ETH", "to": "USD"})),
    ("SOLUSD", "SOL/USD",        "crypto",   2, False, "USD",     "SOL-USD",  ("fx", {"from": "SOL", "to": "USD"})),
    ("XRPUSD", "XRP/USD",        "crypto",   3, False, "USD",     "XRP-USD",  ("fx", {"from": "XRP", "to": "USD"})),

    # Metals are SPOT, from gold-api.com — Yahoo only carries the futures
    # contracts (GC=F, SI=F, HG=F), which trade at a basis to spot.
    ("XAUUSD", "Gold Spot",      "commodities", 2, True,  "USD/oz",  "spot:XAU", None),
    ("XAGUSD", "Silver Spot",    "commodities", 2, False, "USD/oz",  "spot:XAG", None),
    ("XPTUSD", "Platinum Spot",  "commodities", 2, False, "USD/oz",  "spot:XPT", None),
    ("COPPER", "Copper Spot",    "commodities", 4, False, "USD/lb",  "spot:HG",  None),

    # There is no free spot feed for crude: WTI and Brent are quoted worldwide
    # off the front-month contract, so that is what this row is — named as such.
    ("WTI",    "WTI Crude (front-month)", "commodities", 2, True, "USD/bbl", "CL=F",
     ("commodity", {"function": "WTI", "interval": "daily"})),
]

ALL_IDS = [s[0] for s in SOURCES]
ALL_TAPE = [s[0] for s in SOURCES if s[4]]


class RateLimited(Exception):
    pass


# ------------------------------------------------------------------ http --

_last_call = [0.0]


def _throttle(min_gap):
    gap = min_gap - (time.monotonic() - _last_call[0])
    if gap > 0:
        time.sleep(gap)
    _last_call[0] = time.monotonic()


def _get_json(url, headers, min_gap):
    _throttle(min_gap)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        if err.code in (429, 999):
            raise RateLimited(f"HTTP {err.code} — ถูกจำกัดอัตราการเรียก")
        raise


# ----------------------------------------------------------------- yahoo --

def fetch_yahoo(spec):
    """
    One call per symbol. Returns (last, prev_close, timestamp, series).

    The chart endpoint hands back the real intraday path, so charts plot
    actual trading rather than a synthesised line.
    """
    ysym = spec[6]
    url = f"{YAHOO_CHART}{urllib.parse.quote(ysym)}?interval=5m&range=1d"
    payload = _get_json(url, YAHOO_UA, 0.3)

    result = (payload.get("chart") or {}).get("result") or []
    if not result:
        err = (payload.get("chart") or {}).get("error")
        raise RuntimeError(str(err) if err else "empty chart response")

    meta = result[0].get("meta") or {}
    last = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    if last is None:
        raise RuntimeError("no regularMarketPrice")
    if prev is None:
        prev = last

    # Intraday closes, gaps dropped.
    try:
        raw = result[0]["indicators"]["quote"][0]["close"]
        closes = [float(c) for c in raw if isinstance(c, (int, float))]
    except (KeyError, IndexError, TypeError):
        closes = []

    ts = meta.get("regularMarketTime")
    stamp = (datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
             if isinstance(ts, (int, float)) else None)

    return float(last), float(prev), stamp, closes


def fetch_spot(spec):
    """
    Spot metal price from gold-api.com. Returns (last, None, timestamp, []).

    The feed carries only the current price — no previous close — so the
    caller derives the daily comparison from yesterday's stored close.
    """
    code = spec[6].split(":", 1)[1]
    payload = _get_json(f"{SPOT_API}{urllib.parse.quote(code)}", YAHOO_UA, 0.3)

    if "price" not in payload:
        raise RuntimeError("no price in spot response")

    stamp = str(payload.get("updatedAt") or "").replace("T", " ").replace("Z", "")
    return float(payload["price"]), None, stamp or None, []


# -------------------------------------------------------- alpha vantage --

def _av_call(params, key):
    _throttle(1.1)     # free tier asks for <= 1 request/second
    url = f"{AV_BASE}?{urllib.parse.urlencode({**params, 'apikey': key})}"
    req = urllib.request.Request(url, headers={"User-Agent": "libera-analysts/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        payload = json.loads(res.read().decode("utf-8"))

    for field in ("Note", "Information", "Error Message"):
        if field in payload:
            text = str(payload[field])
            if any(w in text.lower() for w in ("rate limit", "premium", "frequency")):
                raise RateLimited(text)
            raise RuntimeError(text)
    return payload


def fetch_alphavantage(spec, key):
    """Returns (last, prev_close_or_None, timestamp, series=[])."""
    entry = spec[7]
    if not entry:
        raise RuntimeError("ไม่มี endpoint ของ alphavantage สำหรับสินทรัพย์นี้")
    kind, args = entry

    if kind == "stock":
        q = (_av_call({"function": "GLOBAL_QUOTE", "symbol": args["symbol"],
                       "datatype": "json"}, key).get("Global Quote") or {})
        if not q:
            raise RuntimeError("empty quote")
        return float(q["05. price"]), float(q["08. previous close"]), q.get("07. latest trading day"), []

    if kind == "fx":
        q = (_av_call({"function": "CURRENCY_EXCHANGE_RATE", "from_currency": args["from"],
                       "to_currency": args["to"], "datatype": "json"}, key)
             .get("Realtime Currency Exchange Rate") or {})
        if not q:
            raise RuntimeError("empty rate")
        return float(q["5. Exchange Rate"]), None, q.get("6. Last Refreshed"), []

    if kind == "metal":
        d = _av_call({"function": "GOLD_SILVER_SPOT", "symbol": args["symbol"]}, key)
        if "price" not in d:
            raise RuntimeError("empty spot")
        return float(d["price"]), None, d.get("timestamp"), []

    if kind == "commodity":
        d = _av_call({"function": args["function"], "interval": args.get("interval", "daily"),
                      "datatype": "json"}, key)
        rows = [r for r in d.get("data", []) if r.get("value") not in (".", "", None)]
        if not rows:
            raise RuntimeError("empty series")
        prev = float(rows[1]["value"]) if len(rows) > 1 else None
        return float(rows[0]["value"]), prev, rows[0].get("date"), []

    raise RuntimeError(f"unknown kind {kind}")


def alphavantage_key():
    key = os.environ.get("ALPHAVANTAGE_API_KEY", "").strip()
    if key:
        return key
    cfg = ROOT / "config.local.json"
    if cfg.exists():
        try:
            key = json.loads(cfg.read_text(encoding="utf-8")).get("alphavantageKey", "").strip()
        except (json.JSONDecodeError, OSError) as err:
            raise SystemExit(f"config.local.json อ่านไม่ได้: {err}")
        if key and key != "PASTE_YOUR_KEY_HERE":
            return key
    raise SystemExit(
        "\n  ยังไม่มีคีย์ Alpha Vantage — ใส่ใน config.local.json\n"
        '      {"alphavantageKey": "YOUR_KEY"}\n'
        "  หรือใช้แหล่งที่ไม่ต้องใช้คีย์:  --provider yahoo\n"
    )


# -------------------------------------------------------------- file i/o --

def load_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def write_atomic(path, payload):
    """Write to a temp file then replace, so a reader never sees half a file."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def downsample(points, target):
    if len(points) <= target:
        return list(points)
    step = len(points) / target
    out = [points[int(i * step)] for i in range(target)]
    out[-1] = points[-1]
    return out


# --------------------------------------------------------------- refresh --

def refresh(provider, specs, key=None, verbose=True):
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    prev_doc = load_json(DATA / "quotes.json", {"quotes": []})
    prev_by_sym = {q["symbol"]: q for q in prev_doc.get("quotes", [])}
    series_doc = load_json(DATA / "series.json", {"series": {}})

    quotes, failures = [], []

    for spec in specs:
        sym, name, cls, dec, in_tape, unit, _ysym, _av = spec
        old = prev_by_sym.get(sym, {})

        # A changed unit or feed means the stored history is not comparable
        # (copper quoted per ton vs per pound would read as a -99% crash).
        # Drop the history rather than print a nonsense percentage.
        if old and old.get("unit") not in (None, unit):
            old = {}

        try:
            if spec[6].startswith("spot:"):
                # Spot metals always come from the keyless spot feed; the
                # provider flag only picks who serves everything else.
                last, prev_close, src_ts, feed_series = fetch_spot(spec)
            elif provider == "yahoo":
                last, prev_close, src_ts, feed_series = fetch_yahoo(spec)
            else:
                last, prev_close, src_ts, feed_series = fetch_alphavantage(spec, key)
        except RateLimited:
            raise
        except (urllib.error.URLError, RuntimeError, KeyError, ValueError, TimeoutError) as err:
            # Keep the last good price and flag it — never blank a row.
            failures.append(f"{sym}: {type(err).__name__} {err}")
            if old:
                quotes.append({**old, "stale": True})
            continue

        change_known, basis = True, "prevClose"
        if prev_close is None:
            if old.get("sessionDate") == today and old.get("prevClose") is not None:
                # Same day: keep the reference already established, so the
                # percentage does not shift around during the session.
                prev_close = float(old["prevClose"])
                change_known = bool(old.get("changeKnown", False))
                basis = old.get("changeBasis", "session")
            elif old.get("last") is not None:
                # A new UTC day: yesterday's final price IS the previous close.
                prev_close = float(old["last"])
                basis = "prevClose"
            else:
                # Nothing stored yet — report no change rather than a fake 0.00%.
                prev_close, change_known, basis = last, False, "session"

            # Only claim ignorance when there is genuinely nothing to compare
            # against; a real session move is worth showing.
            change_known = prev_close != last

        change = last - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0.0

        if len(feed_series) >= 2:
            points = [round(p, dec) for p in downsample(feed_series, SERIES_POINTS)]
            if points[-1] != round(last, dec):
                points.append(round(last, dec))
        else:
            # No path from the feed — accumulate one by appending each poll.
            points = list(series_doc.get("series", {}).get(sym, {}).get("points", []))
            if not points:
                points = [round(prev_close, dec)]
            points.append(round(last, dec))
            points = points[-SERIES_POINTS:]

        series_doc.setdefault("series", {})[sym] = {"symbol": sym, "range": "1D", "points": points}

        session_open = (float(old["sessionOpen"])
                        if old.get("sessionDate") == today and old.get("sessionOpen")
                        else round(prev_close, dec))

        quotes.append({
            "symbol": sym, "name": name, "assetClass": cls, "decimals": dec,
            "last": round(last, dec),
            "prevClose": round(prev_close, dec),
            "change": round(change, dec),
            "changePct": round(change_pct, 2),
            "open": round(points[0], dec),
            "high": round(max(points), dec),
            "low": round(min(points), dec),
            "spark": points[-SPARK_POINTS:],
            "inTape": in_tape,
            "unit": unit,
            "changeKnown": change_known,
            "changeBasis": basis,
            "sessionOpen": session_open,
            "sessionDate": today,
            "sourceTime": src_ts,
            "stale": False,
        })

    if not quotes:
        raise RuntimeError("ทุกสินทรัพย์ล้มเหลว — ไม่แตะไฟล์เดิม")

    # Merge, never replace: symbols this run skipped must survive.
    fetched = {q["symbol"] for q in quotes}
    carried = [q for q in prev_doc.get("quotes", []) if q["symbol"] not in fetched]
    merged = quotes + carried
    order = {s: i for i, s in enumerate(ALL_IDS)}
    merged.sort(key=lambda q: order.get(q["symbol"], 999))

    stamp = now.isoformat(timespec="seconds")
    write_atomic(DATA / "quotes.json", {
        "asOf": stamp,
        "source": "Yahoo Finance" if provider == "yahoo" else "Alpha Vantage",
        "delayedMinutes": 15,
        "refreshSeconds": 300,
        "partial": bool(failures) or len(specs) < len(SOURCES),
        "tape": ALL_TAPE,
        "quotes": merged,
    })
    series_doc["asOf"] = stamp
    write_atomic(DATA / "series.json", series_doc)

    if verbose:
        ok = len(quotes) - len(failures)
        extra = f", {len(carried)} คงค่าเดิม" if carried else ""
        print(f"  [{now.strftime('%H:%M:%S')} UTC] อัปเดต {ok}/{len(specs)} สินทรัพย์{extra}")
        for f in failures:
            print(f"      ! {f}")
    return len(failures)


# ------------------------------------------------------------------ main --

def main():
    ap = argparse.ArgumentParser(description="ดึงราคาตลาดจริงลง data/*.json")
    ap.add_argument("--provider", choices=["yahoo", "alphavantage"], default="yahoo")
    ap.add_argument("--once", action="store_true", help="ดึงรอบเดียวแล้วออก")
    ap.add_argument("--interval", type=int, default=300, help="วินาทีระหว่างรอบ (ค่าเริ่มต้น 300)")
    ap.add_argument("--symbols", default="", help="เลือกเฉพาะบางตัว เช่น XAUUSD,BTCUSD")
    args = ap.parse_args()

    specs = list(SOURCES)
    if args.symbols:
        wanted = {s.strip().upper() for s in args.symbols.split(",") if s.strip()}
        specs = [s for s in specs if s[0] in wanted]
        if not specs:
            raise SystemExit(f"ไม่มีสินทรัพย์ที่ตรงกับ {sorted(wanted)}")

    key = alphavantage_key() if args.provider == "alphavantage" else None

    print("\n  Libera Analysts - quote fetcher")
    print(f"  provider: {args.provider}  |  {len(specs)} สินทรัพย์ -> {DATA}")

    def once():
        try:
            refresh(args.provider, specs, key)
            return True
        except RateLimited as err:
            print(f"\n  ! ถูกจำกัดอัตราการเรียก:\n    {err}\n")
            return False
        except (RuntimeError, OSError) as err:
            print(f"  ! ดึงไม่สำเร็จ ใช้ข้อมูลเดิมต่อ: {err}")
            return True

    if args.once:
        raise SystemExit(0 if once() else 1)

    print(f"  รีเฟรชทุก {args.interval} วินาที — กด Ctrl+C เพื่อหยุด\n")
    while True:
        if not once():
            return
        try:
            time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\n  หยุดแล้ว")
            return


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n  หยุดแล้ว")
