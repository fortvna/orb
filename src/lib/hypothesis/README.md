# fortvna.hypothesis.v0

Shared card across Metis / Orb / Themis. No invented PnL. No Metis monorepo dep.

Locked IDs (see `id-map.ts`):

- `strt-fortvna-lonny-ib` ↔ Orb `pb-ib` ↔ Crucible `lonny-ib`
- `strt-santana-nq-sma25-orb` ↔ Crucible `santana-sma25-orb`

Yahoo session tape ≠ Themis ask. `execution_ready` is always false on Orb. QQQ is not NQ; SPY is not ES.

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
- Limit-on-wick fills assume the 25% level was tradable; we do not invent a queue or slippage model.
- Same-bar break + retrace is not filled (we wait for the next bar).
- Santana SMA25 engulf is imported as a card only; the eval engine does not run that trigger.
