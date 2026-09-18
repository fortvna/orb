# fortvna.hypothesis.v0

Shared card across Metis / Orb / Themis. No invented PnL. No Metis monorepo dep.

Locked IDs (see `id-map.ts`):

- `strt-fortvna-lonny-ib` ↔ Orb `pb-ib` ↔ Crucible `lonny-ib`
- `strt-santana-nq-sma25-orb` ↔ Crucible `santana-sma25-orb`
- `strt-rherman-streak-failure-reversal` ↔ Orb `pb-streak-herman` ↔ Crucible `herman-streak-failure` (author defaults v1)

Yahoo session tape ≠ uploaded 1m pack ≠ Themis ask. `execution_ready` is always false on Orb. QQQ is not NQ; SPY is not ES.

## LONNY fill model (Grounding-v1 §1)

Implemented in `src/lib/market/evaluate.ts` for the LONNY sleeve:

- London color 02:00–08:00 NY; missing London bars → no trade (cannot apply the freeze).
- IB 09:30–10:30; OCC = first-hour color; conflict with London or break side → no trade.
- After the IB extreme breaks, **next bar** is the first eligible fill (not the break bar).
- **Next-open:** if that bar’s open is through the IB 25% limit, fill at open, then **stop-first on the same bar**.
- If the open is not through but the wick trades the limit, fill at the limit and **do not** take stop/target on that same bar (OHLC path unknown).
- Stop = IB 50% (mid). TP1 = 0.5× IB beyond the broken extreme. Flatten at 15:00 NY open.

### Fill gaps we do not paper over

- Yahoo 5m (typical eval tape) is not the 1m Grounding freeze. Intra-bar order of high/low is unknown except the next-open case above.
- Yahoo 1m history is only ~5 Globex days; 5m ~60. Overnight London is present on Globex futures (`includePrePost`) but absent on RTH-only slices — those days produce no LONNY fill.
- **Uploaded 1m pack** (`fortvna.tape.v0`): user OHLC (Databento/CSV/manual) preferred over Yahoo when present for that symbol. Eval source is `pack` (validatable; still not Themis). Empty pack → empty eval; bars are never invented. See `src/lib/market/tape-pack.md`.
- Limit-on-wick fills assume the 25% level was tradable; we do not invent a queue or slippage model.
- Same-bar break + retrace is not filled (we wait for the next bar).
- Santana SMA25 engulf is imported as a card only; the eval engine does not run that trigger.

## Herman streak failure (author defaults v1)

Implemented in `src/lib/market/evaluate.ts` for `pb-streak-herman` / kind `streak`:

- Signal TF = chart 1m. Streak = 5 consecutive bullish/bearish **bodies** (close vs open). Doji resets.
- Bull streak arms SHORT; bear streak arms LONG. Setup close must be in **09:45–12:00** America/New_York; the streak may start before the session (still inside RTH work bars).
- Confirm = a later 1m **close** beyond the terminal streak extreme within 15 signal bars (SHORT: close < terminal low; LONG: close > terminal high). Wicks alone do not confirm. Confirm must also be in session.
- Entry: **next 1m open** after confirm. SL = terminal streak candle extreme. TP = **1R** from fill to SL. Hard flat **16:00** ET open. One position per session.
- Next-open fill scans the fill bar stop-first when both SL and TP print (OHLC path: filled at open, rest of bar is fair).

Author Aug–Sep NQ 1m screenshot is marketing, not measured edge. Do not optimize ATR min-range / 1.5R in this sleeve.

### Fill gaps we do not paper over

- Yahoo 5m is not the 1m freeze (waitBars would count 5m bars). Prefer an uploaded 1m pack.
- Orb session helpers use bar **open** minutes; Pine uses `time_close`. Boundary 1m bars can differ by one minute.
- Pre-09:30 Globex bodies are not in RTH `workBars` (author session still only arms on a 09:45–12:00 setup close, which only needs four prior RTH minutes).
- Commission on fills is desk NQ-ish (`$4.08` RT on futures). Slippage is **not** added to PF. Do not invent edge from thin/synthetic tape.
