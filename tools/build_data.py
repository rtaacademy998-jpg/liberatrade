"""
Libera Analysts — market data builder.

Headline numbers come from the design canvas (real market data, 9 July 2026).
OHLC and sparkline points are synthesised around them so the charts have
something plausible to draw. Swap this for a real quote feed in production —
the JSON shape is the contract the front end reads.

    python tools/build_data.py
"""

import json
import math
import random
from pathlib import Path

random.seed(20260709)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

AS_OF = "2026-07-09T14:32:00+07:00"

# symbol, display name, asset class, last, change %, decimals
QUOTES = [
    ("SET",      "SET Index",       "equities",    1412.87,  0.84, 2),
    ("SPX",      "S&P 500",         "equities",    6241.05,  0.32, 2),
    ("NDX",      "NASDAQ",          "equities",   22870.14,  0.61, 2),
    ("NIKKEI",   "Nikkei 225",      "equities",   41220.50, -0.45, 2),
    ("US30",     "Dow Jones",       "equities",   44652.30, -0.18, 2),
    ("NVDA",     "NVIDIA Corp",     "equities",    1184.20,  1.94, 2),

    ("EURUSD",   "EUR/USD",         "forex",          1.1742,  0.09, 4),
    ("USDJPY",   "USD/JPY",         "forex",        146.28,  -0.21, 2),
    ("GBPUSD",   "GBP/USD",         "forex",          1.3654,  0.14, 4),
    ("USDTHB",   "USD/THB",         "forex",         32.41,  -0.14, 2),

    ("BTCUSD",   "BTC/USD",         "crypto",    108924.00,  2.31, 0),
    ("ETHUSD",   "ETH/USD",         "crypto",      4128.50,  1.87, 2),
    ("SOLUSD",   "SOL/USD",         "crypto",       248.60,  3.10, 2),
    ("XRPUSD",   "XRP/USD",         "crypto",         2.914, -0.52, 3),

    # Gold uses the real 9 Jul 2026 figures from analysis page 7a. The homepage
    # canvas showed 3,342.10, but the analysis screens were built from live data
    # and are the authority — one number, everywhere.
    ("XAUUSD",   "Gold Spot",       "commodities",  4106.03,  0.73, 2),
    ("WTI",      "WTI Crude",       "commodities",    68.42, -1.12, 2),
    ("XAGUSD",   "Silver Spot",     "commodities",    38.94,  0.65, 2),
    ("COPPER",   "Copper",          "commodities",     5.12,  0.41, 2),
]

# Symbols shown in the ticker tape, in order.
TAPE = ["SET", "SPX", "NDX", "NIKKEI", "XAUUSD", "WTI", "EURUSD", "USDTHB", "BTCUSD"]

# Where the canvas gave real session figures, use them verbatim instead of
# synthesising. Keys map onto the quote object.
OVERRIDES = {
    "XAUUSD": {
        "open": 4075.65, "high": 4106.03, "low": 4053.86, "prevClose": 4076.32,
        "change": 29.71, "unit": "USD/oz",
        "yearLow": 3268.0, "yearHigh": 5597.0, "ytdPct": -4.25,
    },
    "US30": {
        "unit": "index",
    },
}


def spark(last, change_pct, n=24):
    """
    A believable intraday path from the previous close to `last`.

    Brownian bridge: walk randomly, then subtract the accumulated error
    linearly so the path is pinned at both ends without looking eased.
    """
    prev = last / (1 + change_pct / 100)
    # Intraday noise scales with the day's move, with a floor so flat days
    # still wiggle rather than drawing a ruler-straight line.
    step = (abs(last - prev) * 0.55 + last * 0.0016) / math.sqrt(n)

    walk = [0.0]
    for _ in range(n - 1):
        walk.append(walk[-1] + random.gauss(0, step))

    pts = []
    for i in range(n):
        t = i / (n - 1)
        bridged = walk[i] - walk[-1] * t          # pin the end at zero
        pts.append(prev + (last - prev) * t + bridged)
    return pts


def build_quotes():
    out = []
    for sym, name, cls, last, pct, dec in QUOTES:
        prev = last / (1 + pct / 100)
        path = spark(last, pct)
        quote = {
            "symbol": sym,
            "name": name,
            "assetClass": cls,
            "decimals": dec,
            "last": round(last, dec),
            "prevClose": round(prev, dec),
            "change": round(last - prev, dec),
            "changePct": pct,
            "open": round(path[0], dec),
            "high": round(max(path), dec),
            "low": round(min(path), dec),
            "spark": [round(p, dec) for p in path],
            "inTape": sym in TAPE,
        }
        override = OVERRIDES.get(sym, {})
        quote.update(override)

        # When a real session high/low is pinned, the synthetic path must fit
        # inside it — clamp the path rather than widening the real range.
        if "high" in override or "low" in override:
            hi, lo = quote["high"], quote["low"]
            path = [min(max(p, lo), hi) for p in path]
            quote["spark"] = [round(p, dec) for p in path]
            quote["open"] = round(min(max(quote["open"], lo), hi), dec)

        out.append(quote)
    out.sort(key=lambda q: TAPE.index(q["symbol"]) if q["symbol"] in TAPE else 99)
    return {"asOf": AS_OF, "delayedMinutes": 15, "tape": TAPE, "quotes": out}


def build_series(quotes):
    """
    Denser intraday paths for the full-size charts.

    The canvas drew these as hand-authored SVG `d` attributes — placeholders.
    Real charts must plot real prices, so the series is generated here and the
    reference lines are positioned by price, not by pixel.
    """
    out = {}
    for q in quotes:
        dec = q["decimals"]
        path = spark(q["last"], q["changePct"], n=90)
        lo, hi = q["low"], q["high"]
        path = [min(max(p, lo), hi) for p in path]
        path[0] = q["open"]
        path[-1] = q["last"]
        out[q["symbol"]] = {
            "symbol": q["symbol"],
            "range": "1D",
            "points": [round(p, dec) for p in path],
        }
    return {"asOf": AS_OF, "series": out}


def main():
    DATA.mkdir(parents=True, exist_ok=True)

    quotes = build_quotes()
    (DATA / "quotes.json").write_text(
        json.dumps(quotes, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"wrote data/quotes.json ({len(quotes['quotes'])} symbols, {len(TAPE)} in tape)")

    series = build_series(quotes["quotes"])
    (DATA / "series.json").write_text(
        json.dumps(series, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"wrote data/series.json ({len(series['series'])} symbols x 90 points)")


if __name__ == "__main__":
    main()
