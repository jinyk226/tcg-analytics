@AGENTS.md

# TCG Analytics

A locally-run platform that ingests [JustTCG](https://justtcg.com) pricing data into a local
database and surfaces analytics (starting with 7-day gainers/losers) for making quick, daily
Adobe Premiere videos organized by expansion. Pokémon first; designed to expand to other TCGs.

## Quick Reference

- Dev: `npm run dev` (Turbopack; http://localhost:3000)
- Build: `npm run build`
- Lint: `npm run lint` (ESLint)
- Dead code / dupes: `npm run lint:quality` (jscpd + knip)
- DB migrate: `npm run db:migrate` · Studio: `npm run db:studio` · Reset: `npm run db:reset`
- Ingest (once built): `npm run ingest`

## Tech Stack

- Framework: **Next.js 16** (App Router). ⚠️ Breaking changes vs. training data — see `@AGENTS.md`;
  read `node_modules/next/dist/docs/` before writing Next code. Notably: `params`/`searchParams`
  are **async**, GET route handlers are **not cached by default**.
- Language: TypeScript 5 (strict). React 19.
- Database: **SQLite** (`./dev.db`) via **Prisma 7**.
- Styling: **Tailwind v4** (`@import "tailwindcss"` in `app/globals.css`; no `tailwind.config.js`).

## Directory Structure

```
app/                    App Router: routes, layout, global styles
  _components/          Client "container" components (stateful, interactive)
  _ui/                  Presentational leaf components (STATELESS — enforced by lint)
  api/                  Route handlers
lib/                    Server-side modules
  db.ts                 Shared Prisma client singleton (import { db })
  generated/prisma/     GENERATED Prisma client — never edit or lint (gitignored)
  justtcg/              JustTCG API client + ingestion (once built)
scripts/                CLI scripts run via tsx (e.g. ingestion)
prisma/schema.prisma    Database schema
docs/                   Subsystem docs & plans (see docs/README.md)
specs/                  Requirements
```

## Prisma 7 Conventions (important — differs from older Prisma)

- Generator is `prisma-client` (not `prisma-client-js`); it emits **TypeScript** to
  `lib/generated/prisma`. Import the client from there: `@/lib/generated/prisma/client`.
- Prisma 7's default engine has **no bundled binary** and **requires a driver adapter**. We use
  `@prisma/adapter-better-sqlite3`, wired in `lib/db.ts`. Always import the shared `db` from
  `lib/db.ts` — do not `new PrismaClient()` elsewhere.
- `DATABASE_URL` lives in `.env` and is consumed via `prisma.config.ts` (which imports
  `dotenv/config`), not inline in `schema.prisma`.
- After schema changes: `npm run db:migrate` (regenerates the client).

## Backend / Data Conventions

- Query Prisma directly from async Server Components and route handlers via `import { db }`.
- Long-running ingestion runs as a **CLI script** (`scripts/`, via `tsx`), not inside a request
  handler — avoids timeouts and better-sqlite3 is a synchronous single-writer.
- Ingestion must be **idempotent** (upserts) and respect JustTCG rate limits (throttle from the
  live `_metadata.apiRateLimit` in each response).
- The schema is TCG-agnostic (Game → Set → Card → CardVariant → PriceSnapshot) so new games slot in.

## Frontend Conventions

- Presentational leaf components go in `app/**/_ui/` and must be **stateless** (no `useState`/
  `useReducer` — enforced by ESLint). Lift state to a parent container in `_components/`.
- Interactive/stateful client components live in `app/**/_components/` with `"use client"`.
- Use Tailwind utility classes / theme tokens (`--color-background`, `--color-foreground`, fonts);
  avoid ad-hoc hex colors and magic spacing values. Responsiveness matters from the start.
- Card images are derived from `tcgplayerId` (TCGplayer CDN); no image URL is stored in the DB.

## What NOT to Do

- NEVER edit `.env` or environment files (contains `JUSTTCG_API_KEY`).
- NEVER edit or lint `lib/generated/**` (regenerate via `npm run db:generate`).
- NEVER run destructive git ops (`reset --hard`, `rm -rf`) unless explicitly instructed.
- NEVER add `eslint-disable` to silence a rule — fix the actual issue (blanket disables are a lint
  error).
- NEVER create abstractions that weren't asked for.

## Testing / Verification

- Prefer end-to-end interface checks over unit tests: run the ingest CLI against one set
  (`npm run ingest -- --set <slug>`), inspect rows in `npm run db:studio`, then drive the UI.
- Use Playwright MCP to verify client interactions (filters, copy button, export download).

## Commit Rules

- Commit in small, logical increments. Use `/commit` (or the commit-smart skill) after a coherent unit.
- Branch off `main` for feature work; don't commit generated clients, `dev.db`, or `.env`.

## Context Tips

- One chat = one task. Reference `docs/**` for subsystem plans (e.g.
  `docs/7day-movers-export/plan.md` + `progress.md` for the current feature).
