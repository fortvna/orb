# Orb

The trading desk for **live charts**, **replay**, **statistical reports**, **journaling**, and **imported playbooks** — in one product.

Orb is a name, not an opening-range strategy. It combines a Nami-style replay tape (killzones, HTF candles, PO3, drawings), TradingView, a live Yahoo feed, session reports, and a trade journal.

Live market data. Not a broker. Not financial advice.

## The chain

**Mentor** writes and validates a playbook → **Replay** evaluates it on live historical tape → **Reports** are generated from those fills → **Analytics** rolls the reports up.

## Modules

- **Desk** — live watchlist, change, spark, session levels
- **Charts** — Orb tape (VWAP, killzones, HTF, PO3, drawings) plus TradingView
- **Replay** — bar-by-bar playback of real Yahoo sessions, playbooks loaded, evaluation simulator
- **Reports** — session base rates plus playbook evals and user-defined reports
- **Journal** — calendar with stats
- **Analytics** — generated from reports and playbooks
- **Playbooks** — import JSON / CSV / Markdown / Metis `strt-*.md`, evaluate on live tape or an uploaded 1m pack (`fortvna.tape.v0`)
- **Prop** — challenge rule board against the journal
- **Mentor** — draft, validate, then evaluate

## Stack

React, TanStack Start, Tailwind, Zustand, Recharts. Live feed via Yahoo Finance (server). Charts via canvas tape + TradingView widget.
