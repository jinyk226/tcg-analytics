# TCG Analytics

A locally-run analytics platform for trading card games, built on the
[JustTCG](https://justtcg.com) API. It ingests card and pricing data into a
local database so you can run price-history and market analytics — primarily
for **Pokémon** today, with the schema designed to expand to other TCGs
(e.g. Riftbound) without reshaping.

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

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database

The local database is **SQLite** (`./dev.db`), accessed through **Prisma 7**
using the `better-sqlite3` driver adapter. (Prisma 7's default engine ships no
binary and connects through a driver adapter — see `lib/db.ts`.)

Connect to it from anywhere in the app via the shared, hot-reload-safe client:

```ts
import { db } from "@/lib/db";

const cards = await db.card.findMany({
  include: { variants: { include: { snapshots: true } } },
});
```

### Schema

The data model mirrors the JustTCG hierarchy and is TCG-agnostic
(`prisma/schema.prisma`):

| Model           | Role                                                                 |
| --------------- | ------------------------------------------------------------------- |
| `Game`          | A card game — `pokemon`, `riftbound`, … (unique `key`)              |
| `Set`           | An expansion within a game                                          |
| `Card`          | A card, keyed by `justTcgId`; links to its game and set             |
| `CardVariant`   | A priceable printing × condition (e.g. Holofoil / Near Mint)        |
| `PriceSnapshot` | A point-in-time price observation — the core analytics time series  |

> Migrating to Postgres later means swapping the datasource provider and driver
> adapter; the schema and query code stay the same.

### Scripts

| Command               | Description                                     |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | Start the Next.js dev server                    |
| `npm run build`       | Production build                                |
| `npm run db:migrate`  | Create/apply migrations (`prisma migrate dev`)  |
| `npm run db:generate` | Regenerate the Prisma client                    |
| `npm run db:studio`   | Open Prisma Studio to browse the database       |
| `npm run db:reset`    | Drop and recreate the database from migrations  |
| `npm run lint`        | Run ESLint                                       |

## Project Structure

```
app/                    Next.js App Router (routes, layout, styles)
lib/db.ts               Shared Prisma client (SQLite via better-sqlite3)
lib/generated/prisma/   Generated Prisma client (gitignored)
prisma/schema.prisma    Database schema
prisma/migrations/      Migration history
prisma.config.ts        Prisma config (schema path, datasource, migrations)
```

## Roadmap

- JustTCG API client + ingestion routine (upsert cards, append price snapshots)
- Analytics views over the `PriceSnapshot` time series
- Support for additional TCGs (Riftbound and beyond)
