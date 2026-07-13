# TCG Analytics

A locally-run analytics platform for trading card games, built on the
[JustTCG](https://justtcg.com) API. It ingests card and pricing data into a
local database and surfaces analytics — starting with **7-day gainers/losers**
for making quick, daily videos organized by expansion series. Primarily for
**Pokémon** today; the schema is TCG-agnostic so other games (e.g. Riftbound)
slot in without reshaping.

Built with [Next.js 16](https://nextjs.org) (App Router), TypeScript, and
[Prisma 7](https://www.prisma.io) on SQLite.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

`postinstall` automatically runs `prisma generate` to build the client.

### 2. Configure environment

Create a `.env` file in the project root:

```bash
DATABASE_URL="file:./dev.db"
JUSTTCG_API_KEY="your_justtcg_api_key"
```

`.env` is gitignored — never commit your API key.

### 3. Set up the database

```bash
npm run db:migrate   # apply migrations, creating ./dev.db
```

### 4. Ingest data

```bash
npm run ingest                        # full Pokémon catalog sync
npm run ingest -- --set base-set-pokemon   # one set (quick test)
npm run ingest -- --incremental       # skip sets synced in the last 20h
```

A full sync pulls every Pokémon set's English cards + pricing (~420 API
requests, ~10 min on the Starter plan). It's idempotent and crash/quota-resumable
— rerun any time.

#### Scheduled sync (macOS)

A launchd agent runs the sync automatically. It fires daily at 06:00, but
`scripts/ingest-daily.sh` enforces an **every-other-day** cadence via a timestamp
guard (`.ingest-last-run`), which keeps the monthly total (~6.3k) under the 10k
JustTCG cap.

> **macOS:** keep the repo **outside** `~/Documents`, `~/Desktop`, and `~/Downloads`.
> Those folders are TCC-protected and a background launchd job can't read them —
> the run fails with `exit 126` / `Operation not permitted`. See
> [`docs/automated-ingest.md`](docs/automated-ingest.md) §7.

```bash
# Install (fill in your paths — see the template header):
#   __PROJECT_DIR__ = repo path, __NODE_BIN__ = `dirname "$(which node)"`, __HOME__ = $HOME
cp scripts/com.tcg-analytics.ingest.plist.template \
   ~/Library/LaunchAgents/com.tcg-analytics.ingest.plist   # then edit placeholders
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tcg-analytics.ingest.plist

launchctl list | grep tcg-analytics          # confirm it's loaded
tail -f ~/Library/Logs/tcg-analytics-ingest.log   # watch runs
launchctl bootout gui/$(id -u)/com.tcg-analytics.ingest   # disable
```

Run the wrapper manually any time with `bash scripts/ingest-daily.sh` (it still
respects the 2-day guard; delete `.ingest-last-run` to force a run).

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage: 7-Day Movers

The home page ranks the **biggest 7-day gainers and losers** among Near-Mint
English singles. Filter by **series** (Scarlet & Violet, Sword & Shield, Mega
Evolution, …), **price band** (default $0.50–$20), direction, and list size.
The price band matches if either the current or the 7-days-ago price is in
range, so cards that mooned past the band still surface.

A **quality filter** screens out thin/thrashy markets: **Max chg (7d)** caps
`priceChangesCount7d` (default 5 — drops the ~half of raw movers that churn 6+
times a week), and an optional **Max COV** caps dispersion. The **Chg 7d** column
shows each card's change count (COV in its tooltip). See
[`docs/volatility-quality-filter.md`](docs/volatility-quality-filter.md) for the
analysis behind the defaults.

- **Copy** (per row) puts `Name (#number) — Printing, NM / Set / $Value /
  ±%change (7d)` on the clipboard for video captions.
- **Batch export images** downloads a ZIP of the current list's card images
  (from the TCGplayer CDN), rank-prefixed so they import into Premiere in order.

## Database

The local database is **SQLite** (`./dev.db`), accessed through **Prisma 7**
using the `better-sqlite3` driver adapter. (Prisma 7's default engine ships no
binary and connects through a driver adapter — see `lib/db.ts`.)

Query it from anywhere via the shared, hot-reload-safe client:

```ts
import { db } from "@/lib/db";

const cards = await db.card.findMany({
  include: { variants: { include: { snapshots: true } } },
});
```

### Schema

The data model mirrors the JustTCG hierarchy and is TCG-agnostic
(`prisma/schema.prisma`):

| Model           | Role                                                                          |
| --------------- | ---------------------------------------------------------------------------- |
| `Game`          | A card game — `pokemon`, `riftbound`, … (unique `key`)                       |
| `Set`           | An expansion; carries a derived `series`/era + `lastSyncedAt`                |
| `Card`          | A card, keyed by `justTcgId`; holds `tcgplayerId` (image + cross-ref)        |
| `CardVariant`   | A printing × condition with price + 7d analytics (`priceChange7d`, `startPrice7d`) |
| `PriceSnapshot` | A point-in-time price observation — our own accumulating time series          |

> JustTCG has no series field or images; series are derived in
> `lib/justtcg/series.ts` (curated map + release-date fallback), and images come
> from the TCGplayer CDN via `tcgplayerId`. Migrating to Postgres later means
> swapping the datasource provider and driver adapter; schema/queries stay the same.

### Scripts

| Command                | Description                                          |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start the Next.js dev server                        |
| `npm run build`        | Production build                                     |
| `npm run ingest`       | Sync JustTCG data into the DB (see flags above)      |
| `npm run db:migrate`   | Create/apply migrations (`prisma migrate dev`)       |
| `npm run db:generate`  | Regenerate the Prisma client                         |
| `npm run db:studio`    | Open Prisma Studio to browse the database            |
| `npm run db:reset`     | Drop and recreate the database from migrations       |
| `npm run lint`         | Run ESLint                                            |
| `npm run lint:quality` | Duplication (jscpd) + dead-code (knip) checks        |

## Project Structure

```
app/
  page.tsx              7-day movers trends view (Server Component)
  _components/          Stateful client containers (Filters, CopyButton, ExportButton)
  _ui/                  Stateless presentational components (PctBadge)
  api/export/images/    Batch image ZIP export route
lib/
  db.ts                 Shared Prisma client (SQLite via better-sqlite3)
  trends.ts             getMovers / getSeriesList / getDataFreshness
  images.ts             TCGplayer CDN image URLs
  justtcg/              API client, types, series map, ingestion
  generated/prisma/     Generated Prisma client (gitignored)
scripts/ingest.ts       Ingestion CLI (npm run ingest)
prisma/                 schema.prisma + migrations
docs/                   Subsystem plans (see docs/README.md)
```

## Roadmap

- Surface our own snapshot-derived 7d change (once ≥7 days of history) alongside JustTCG's.
- Sealed-product and multi-language views.
- Support additional TCGs (Riftbound and beyond).
