# Project Requirements — TCG Analytics

## Overview

TCG Analytics is a locally-run platform that pulls trading-card pricing data from the JustTCG API
into a local database and turns it into analytics for producing quick, daily social videos
(edited in Adobe Premiere), organized by expansion. Pokémon is the first supported game; the data
model and code are TCG-agnostic so games like Riftbound can be added later.

## Core Requirements

- **Ingest** all Pokémon cards and their variant pricing, per expansion, into the local DB, and
  keep it refreshable (idempotent upserts; builds a daily price-history time series).
- **7-day movers**: query the DB for the greatest 7-day **gainers** and **losers**, ranked
  per variant (each printing × condition ranked separately).
- **Filters**: by **price range** (default $0.50–$20) and by **expansion**.
- **Copy action**: per row, copy a text block — `Name (#number)`, Set, Value, `% change` — for
  pasting into video captions/graphics.
- **Batch image export**: download a ZIP of the card images for the current filtered list
  (images sourced from the TCGplayer CDN via `tcgplayerId`).

## Technical Requirements

- **Stack**: Next.js 16 (App Router) + TypeScript, Prisma 7 over SQLite, Tailwind v4.
- **Ingestion** runs as a `tsx` CLI script (not a request handler); throttles to the JustTCG plan
  limit (Starter: 50 req/min, 100 cards/request, 10k/month) read live from `_metadata`; resumable
  and crash-safe via `Set.lastSyncedAt`.
- **Data model**: TCG-agnostic hierarchy Game → Set → Card → CardVariant → PriceSnapshot.
- **Quality gates**: `npm run lint` (ESLint, incl. component-discipline + no blanket
  eslint-disable) and `npm run lint:quality` (jscpd duplication + knip dead-code) stay clean.
- **Secrets**: `JUSTTCG_API_KEY` and `DATABASE_URL` live in `.env` (gitignored); never committed.
- **Cadence target**: a once-daily full sync (~9k/10k monthly request budget).

## Out of Scope (V1)

- Games other than Pokémon (schema is ready; ingestion mappings are Pokémon-first).
- Official card art / non-TCGplayer image sources.
- Automated scheduling of the daily ingest (run manually via `npm run ingest` for now).
- Cloud hosting / multi-user access — this is a single-user local tool.
- Timeframes other than 7-day for the movers view (24h/30d fields are stored but not surfaced yet).
