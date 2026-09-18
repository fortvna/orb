# fortvna.tape.v0 — uploaded 1m packs

User-provided 1-minute OHLC so Metis Grounding clocks (LONNY London 02:00–08:00 NY) can replay when Yahoo’s RTH-only slice has no overnight bars.

**Yahoo ≠ pack ≠ Themis ask.** `execution_ready` stays false. A pack is not a Databento live client and not a Themis venue. QQQ is not NQ; SPY is not ES.

## JSON

```json
{
  "schema": "fortvna.tape.v0",
  "symbol": "NQ",
  "interval": "1m",
  "source": "databento",
  "session_tz": "America/New_York",
  "bars": [
    { "time": "2026-09-11T13:30:00Z", "open": 24020, "high": 24040, "low": 24010, "close": 24024, "volume": 100 }
  ]
}
```

- `symbol`: Orb id (`NQ`) or a futures root. `NQ.v.0` / `GLBX.MDP3:NQ.v.0` / `MNQ` resolve to `NQ`. **Not** QQQ→NQ.
- `interval`: must be `1m`. Other spacings are kept as uploaded (not resampled into 1m).
- `time`: unix seconds, unix ms/us/ns, ISO with `Z`/offset, or naive `YYYY-MM-DDTHH:MM:SS` treated as **America/New_York**.
- `volume` optional (defaults 0). Delta is a close-in-bar split, not order flow.

## CSV (Databento-ish)

Header aliases: `ts_event`/`time`/`timestamp`, `open`, `high`, `low`, `close`, `volume`. Optional `symbol` column.

```csv
# schema: fortvna.tape.v0
# symbol: NQ
# interval: 1m
# source: databento
# session_tz: America/New_York
ts_event,open,high,low,close,volume
2026-09-11T06:00:00.000000000Z,23900,23920,23880,23910,100
```

Databento `ohlcv-1m` integer `ts_event` nanoseconds are parsed from the **string** (JSON numbers lose ns precision; ISO is safer).

## Limits

- Cap **80,000** bars (most recent kept). Warn at **50,000**.
- File size cap **12 MB**.
- localStorage budget ~4.5 MB compact; larger packs stay in memory for the tab only.
- Empty / unreadable file → no bars invented → empty eval.

## How it is used

Playbooks / Replay / Reports: **Upload tape pack**. If a pack exists for the playbook symbol, eval and session build prefer it over Yahoo. Source stamps `pack` (user tape, validatable when sessions > 0) vs `live` (Yahoo) vs `model` / `empty`.

Sessions split with the existing Globex rule: 18:00 ET belongs to the next trading day.
