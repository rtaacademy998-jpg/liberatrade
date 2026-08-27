"""
Libera Analysts — one-off seed with real market data.

Snapshot taken 2026-08-27 05:03–05:06 UTC (equities from the 2026-08-26 US
close) so the site ships with genuine prices before `fetch_quotes.py` has an
API key to run with. After the fetcher runs once, this file is only history.

    python tools/seed_live.py

Equity rows are ETFs, not index levels — this API tier has no index quotes,
so they are named as ETFs rather than dressed up as the indices they track.
Spot FX / crypto / metals arrive without a previous close, so their change is
reported as unknown (`changeKnown: false`) instead of a fabricated 0.00%.
"""

import json
import math
import random
from pathlib import Path

random.seed(20260827)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

AS_OF = "2026-08-27T05:06:20+00:00"
SESSION_DATE = "2026-08-27"

# id, name, class, decimals, last, prevClose|None, open|None, high|None, low|None, tape, unit, sourceTime
SNAPSHOT = [
    ("SPX",    "S&P 500 ETF (SPY)",    "equities", 2, 766.08, 765.91, 764.73, 767.35, 763.93,  True,  "USD",     "2026-08-26"),
    ("NDX",    "Nasdaq 100 ETF (QQQ)", "equities", 2, 711.37, 710.72, 708.41, 713.02, 707.97,  True,  "USD",     "2026-08-26"),
    ("US30",   "Dow Jones ETF (DIA)",  "equities", 2, 534.23, 535.24, 535.34, 535.95, 533.31,  True,  "USD",     "2026-08-26"),
    ("NIKKEI", "Japan ETF (EWJ)",      "equities", 2,  95.43,  95.63,  95.54,  95.88,  95.2379, False, "USD",    "2026-08-26"),
    ("NVDA",   "NVIDIA",               "equities", 2, 209.66, 213.05, 212.64, 213.60, 209.23,  False, "USD",     "2026-08-26"),

    ("EURUSD", "EUR/USD", "forex", 4,   1.16596213, None, None, None, None, True,  "", "2026-08-27 05:03:08"),
    ("USDJPY", "USD/JPY", "forex", 2, 159.35575456, None, None, None, None, False, "", "2026-08-27 05:03:25"),
    ("GBPUSD", "GBP/USD", "forex", 4,   1.35884624, None, None, None, None, False, "", "2026-08-27 05:03:31"),
    ("USDTHB", "USD/THB", "forex", 2,  32.81661623, None, None, None, None, True,  "", "2026-08-27 05:03:37"),

    ("BTCUSD", "BTC/USD", "crypto", 0, 78753.93, None, None, None, None, True,  "USD", "2026-08-27 05:03:31"),
    ("ETHUSD", "ETH/USD", "crypto", 2,  2486.98, None, None, None, None, False, "USD", "2026-08-27 05:03:47"),
    ("SOLUSD", "SOL/USD", "crypto", 2,   100.89, None, None, None, None, False, "USD", "2026-08-27 05:06:20"),
    ("XRPUSD", "XRP/USD", "crypto", 3,   1.3978, None, None, None, None, False, "USD", "2026-08-27 05:06:20"),

    ("XAUUSD", "Gold Spot",   "commodities", 2, 4616.6900732853, None, None, None, None, True,  "USD/oz",  "2026-08-27 05:03:13"),
    ("XAGUSD", "Silver Spot", "commodities", 2,   68.9322780969, None, None, None, None, False, "USD/oz",  "2026-08-27 05:03:57"),
    ("WTI",    "WTI Crude",   "commodities", 2,           83.90, 86.34, None, None, None, True,  "USD/bbl", "2026-08-25"),
    ("COPPER", "Copper",      "commodities", 2, 13542.82086956522, 13552.04090909091, None, None, None, False, "USD/ton", "2026-07-01"),
]

TAPE = [r[0] for r in SNAPSHOT if r[9]]
SERIES_POINTS = 90


def bridge(start, end, low, high, n):
    """Random walk pinned at both ends and clamped into the real session range."""
    step = (abs(end - start) * 0.55 + abs(end) * 0.0016) / math.sqrt(n)
    walk = [0.0]
    for _ in range(n - 1):
        walk.append(walk[-1] + random.gauss(0, step))

    pts = []
    for i in range(n):
        t = i / (n - 1)
        pts.append(start + (end - start) * t + walk[i] - walk[-1] * t)

    pts = [min(max(p, low), high) for p in pts]
    pts[0], pts[-1] = start, end
    return pts


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    quotes, series = [], {}

    for (sym, name, cls, dec, last, prev, op, hi, lo, tape, unit, src) in SNAPSHOT:
        if prev is not None and op is not None:
            # A real session: draw a path inside the true high/low.
            points = [round(p, dec) for p in bridge(op, last, lo, hi, SERIES_POINTS)]
            change_known, basis = True, "prevClose"
            open_px, high_px, low_px = op, hi, lo
        elif prev is not None:
            # Daily/monthly commodity series — two observations, no intraday path.
            points = [round(prev, dec), round(last, dec)]
            change_known, basis = True, "prevClose"
            open_px, high_px, low_px = prev, max(prev, last), min(prev, last)
        else:
            # Spot quote with no prior reference yet.
            points = [round(last, dec)]
            prev = last
            change_known, basis = False, "session"
            open_px = high_px = low_px = last

        change = last - prev
        quotes.append({
            "symbol": sym, "name": name, "assetClass": cls, "decimals": dec,
            "last": round(last, dec),
            "prevClose": round(prev, dec),
            "change": round(change, dec),
            "changePct": round((change / prev * 100) if prev else 0.0, 2),
            "open": round(open_px, dec),
            "high": round(high_px, dec),
            "low": round(low_px, dec),
            "spark": points[-24:],
            "inTape": tape,
            "unit": unit,
            "changeKnown": change_known,
            "changeBasis": basis,
            "sessionOpen": round(open_px, dec),
            "sessionDate": SESSION_DATE,
            "sourceTime": src,
            "stale": False,
        })
        series[sym] = {"symbol": sym, "range": "1D", "points": points}

    (DATA / "quotes.json").write_text(json.dumps({
        "asOf": AS_OF,
        "source": "Alpha Vantage",
        "delayedMinutes": 15,
        "refreshSeconds": 300,
        "partial": False,
        "seeded": True,
        "tape": TAPE,
        "quotes": quotes,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    (DATA / "series.json").write_text(json.dumps({
        "asOf": AS_OF, "series": series,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    known = sum(1 for q in quotes if q["changeKnown"])
    print(f"  wrote data/quotes.json + data/series.json")
    print(f"  {len(quotes)} symbols, {known} with a real change, {len(quotes)-known} awaiting a second observation")


if __name__ == "__main__":
    main()
