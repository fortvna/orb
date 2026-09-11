# Orb

The trading desk for **replay**, **statistical reports**, **journaling**, and **orderflow charts** — in one product.

Orb combines the jobs of market-replay tools, edge reports (opening range, initial balance, gap fill), a trade journal with analytics, and a levels/orderflow chart.

Simulated market data. Not a broker. Not financial advice.

## Modules

- **Desk** — what's in play: watchlist, ORB/IB/gap status, calendar
- **Replay** — bar-by-bar session playback with a paper ticket
- **Charts** — VWAP, EMA, volume profile, cumulative delta, ORB/IB levels
- **Reports** — historical base rates by symbol, weekday, lookback
- **Journal** — tagged fills, notes, manual entry
- **Analytics** — equity, time of day, weekday, setup P&L, calendar
- **Playbooks** — written rules tied to fill stats
- **Prop** — challenge rule board against the journal
- **Mentor** — leaks from the book, plus an optional AI read

## Stack

React, TanStack Start, Tailwind, Zustand, lightweight-charts, Recharts.

```bash
npm install
npm run dev
```
