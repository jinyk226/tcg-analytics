# Plan: JustTCG ingestion + 7-day gainers/losers export tool

## Context

`tcg-analytics` is a locally-run platform (Next.js 16 App Router + Prisma 7 / SQLite,
already set up) for turning JustTCG pricing data into quick, daily Adobe Premiere videos,
organized **by expansion**. This iteration builds the first end-to-end workflow:

1. **Ingest** all Pokémon cards/prices per expansion into the local DB.
2. **Query** the DB for the **7-day greatest gainers and losers**, filterable by **price
   range** (default $0.50–$20) and **expansion**.
3. **Act** on those lists: a **copy** button (Name+number, Set, Value, %change) per row, and
   a **batch image export** (ZIP of card images) for the whole filtered list.

Key research findings driving the design:
- **JustTCG serves no images.** Images come from the **TCGplayer CDN** using each card's
  `tcgplayerId`: `https://tcgplayer-cdn.tcgplayer.com/product/{tcgplayerId}_in_1000x1000.jpg`.
- **JustTCG provides `priceChange7d` per variant** (a percentage), so we rank on it directly —
  no need to wait for our own history to accumulate. We still write `PriceSnapshot` rows so our
  own history builds over time.
- API: base `https://api.justtcg.com/v1`, header `x-api-key`. `GET /sets?game=pokemon`,
  `GET /cards?game=pokemon&set=<slug>&limit=<n>&offset=<n>` with `meta.hasMore` pagination.
  Prices USD. Every response echoes live quota in `_metadata` (`apiRateLimit` per-min,
  `apiRequestsRemaining` monthly, `apiDailyRequestsRemaining`).
- **Plan = Starter: 50 req/min, 100 cards/request, 10,000 requests/month.** This is roomy:
  `/cards` returns 100 cards/page, so a **full Pokémon catalog pass ≈ total_cards ÷ 100 + 1**
  `/sets` call — on the order of **a few hundred requests** (~200–400). At 50 req/min that's a
  **single ~4–8 minute run**, not a multi-day backfill. Budget: a once-daily full sync ≈ ~300 ×
  30 ≈ **~9k/month**, just under the 10k cap — so **once-daily** is the target cadence (twice
  daily risks the monthly ceiling). Ingestion still throttles to the live `apiRateLimit` and
  stops safely if `apiRequestsRemaining` (monthly) nears zero.
- **Decisions from the user:** TCGplayer CDN images · **one row per variant** · **ZIP of images
  only** · **all Pokémon expansions**.

Next.js 16 specifics to honor: Route Handler `params`/`searchParams` are **async**; GET route
handlers are **not cached by default**; read query params via `request.nextUrl.searchParams`;
Server Components query Prisma directly; copy/export buttons are `"use client"`.

---

## 1. Data model changes — `prisma/schema.prisma`

Extend `CardVariant` to store the JustTCG price analytics we rank/filter on, and make `Set`
resumable. New migration via `npx prisma migrate dev --name trends_fields` (DB is empty, safe).

**`CardVariant`** — add:
- `priceChange7d   Float?`  (percent; the ranking key)
- `priceChange24hr Float?`
- `avgPrice        Float?`
- `minPrice7d      Float?`
- `maxPrice7d      Float?`
- `apiLastUpdated  DateTime?`  (from variant `lastUpdated` epoch seconds)
- Indexes: `@@index([priceChange7d])`, `@@index([latestPrice])` (sort + range filter).
  Keep existing `latestPrice`, `condition`, `printing`, `language`, `@@unique([cardId, printing, condition, language])`.

**`Set`** — add:
- `lastSyncedAt DateTime?`  (drives resumable round-robin ingestion)
- optional aggregates from the API set object (nice for a future set view; cheap to store):
  `setValueUsd Float?`, `setValueChange7dPct Float?`

`Card.tcgplayerId` already exists — it's the image + copy key (no image URL stored; derived).

---

## 2. JustTCG ingestion layer — `lib/justtcg/`

**`lib/justtcg/client.ts`** — thin fetch wrapper (native `fetch`, Node 22):
- Base URL + `x-api-key` header from `process.env.JUSTTCG_API_KEY` (throw if missing).
- `getSets(game)`, `getCardsPage(game, setSlug, { limit, offset })` returning `{ data, meta, metadata }`.
- **Throttle to 50 req/min** via a simple limiter that self-adjusts from `_metadata.apiRateLimit`
  (target the smaller of 50 and the echoed value; ~1.2s min spacing between requests). Surface
  `apiRequestsRemaining` (monthly) + `apiDailyRequestsRemaining`; throw a typed
  `QuotaExhaustedError` if either nears 0 so the orchestrator stops cleanly (safety net, not the
  expected path).
- **Page size = 100** (Starter max; `meta` echoes the actual cap).

**`lib/justtcg/types.ts`** — response/envelope + Card/Variant field types from research.

**`lib/justtcg/ingest.ts`** — orchestration, idempotent & resumable:
- `syncGamePokemon()` — designed to complete a **full catalog pass in one run** (~4–8 min at
  50 req/min); `lastSyncedAt` is kept for incremental re-syncs and crash-resume, not multi-day
  trickle:
  1. Upsert `Game{ key:"pokemon" }` (read `cards_count` to log an ETA of `≈ cards_count/100` requests).
  2. `getSets("pokemon")` → upsert each `Set` (by `justTcgId`/slug), store release date + aggregates.
  3. Process sets **ordered by `lastSyncedAt asc nulls first`** (least-recently-synced first, so a
     crashed/partial run resumes where it left off). For each set: page through `/cards`, and per card:
     - upsert `Card` (by `justTcgId`; set `gameId`, `setId`, `name`, `number`, `rarity`, `tcgplayerId`);
     - for each variant: upsert `CardVariant` (unique `[cardId,printing,condition,language]`),
       writing `latestPrice`, `priceChange7d`, `priceChange24hr`, `avgPrice`, `min/maxPrice7d`,
       `apiLastUpdated`, `lastSeenAt`;
     - append `PriceSnapshot` (unique `[variantId, recordedAt-day]`) so history builds daily.
     - After a set fully pages, set its `lastSyncedAt = now()`.
  4. Normally completes all sets in one run; `QuotaExhaustedError` (safety net) stops cleanly and
     the next run resumes with the least-recently-synced sets.
  5. `--incremental` flag: skip sets whose `lastSyncedAt` is within N hours (default: full sync).
- Reuse the shared `db` client from `lib/db.ts`.
- **Cadence:** run once daily (fits the ~9k/month budget). Wiring an automated daily schedule is a
  roadmap item — for now `npm run ingest` is manual/one-shot.

**`scripts/ingest.ts`** — CLI entry run via `tsx` (long full-catalog sync should NOT run inside a
request handler — avoids timeouts, and better-sqlite3 is synchronous single-writer). Flags for
safe testing without burning quota:
- `--set <slug>` (one set, for quick testing), `--max-sets <n>` (cap sets this run),
  `--incremental` (skip recently-synced sets), `--game pokemon` (default).
- Logs per-set progress + remaining monthly/daily quota from `_metadata`.
- `package.json`: `"ingest": "tsx scripts/ingest.ts"`.

> Note: `tsx` is already available (used during setup); add as an explicit devDependency.
> If the dev server and ingestion write concurrently, enable SQLite WAL to avoid lock contention
> (set `PRAGMA journal_mode=WAL` once, or pass better-sqlite3 options in `lib/db.ts`).

---

## 3. Analytics query — `lib/trends.ts`

Single reusable function used by **both** the page and the export route (one source of truth):

```ts
getMovers({ direction: "gainers"|"losers", minPrice=0.5, maxPrice=20,
            setId?, limit=50 }): Promise<MoverRow[]>
```
- Query `CardVariant` where `latestPrice` in `[minPrice, maxPrice]` and `priceChange7d != null`
  (and `setId` if given), `include: { card: { include: { set: true } } }`,
  `orderBy: { priceChange7d: direction==="gainers" ? "desc" : "asc" }`, `take: limit`.
- Map to `MoverRow`: `{ variantId, name, number, setName, printing, condition, value, pct,
  tcgplayerId, imageUrl }`.
- **`lib/images.ts`** → `tcgplayerImageUrl(tcgplayerId)` builds the CDN URL (null-safe).

---

## 4. Frontend — trends view at `app/page.tsx` (replaces boilerplate)

Server Component; reads async `searchParams` (`direction`, `minPrice`, `maxPrice`, `setId`, `limit`)
and calls `getMovers`. `export const dynamic = "force-dynamic"` (always reflect latest ingest).

Layout: expansion picker + gainers/losers toggle + price-range inputs at top, then a ranked list.
Each row: card thumbnail (`<img>` from `imageUrl`), name (#number), printing/condition, set,
value, and a colored `priceChange7d` badge, plus a per-row **Copy** button. A **Batch Export**
button exports the whole current list.

**Client components** (in `app/_components/`):
- `Filters.tsx` — expansion `<select>` (from a `getSets` DB query passed as props), direction
  toggle, min/max price inputs; updates the URL query (`router.push`) so the Server Component
  re-queries. Default range 0.5–20.
- `CopyButton.tsx` — `navigator.clipboard.writeText` of the exact block:
  ```
  {name} (#{number}) — {printing} {condition}
  {setName}
  ${value}
  {+/-}{pct}% (7d)
  ```
- `ExportButton.tsx` — builds the current query string and does
  `window.location = /api/export/images?<same filters>` to download the ZIP (shows pending state).

> Card thumbnails use a plain `<img>` (data tool, remote CDN) to avoid `next/image`
> `remotePatterns` config. If we later want `next/image`, add `tcgplayer-cdn.tcgplayer.com` to
> `images.remotePatterns` in `next.config.ts`.

---

## 5. Batch image export — `app/api/export/images/route.ts`

`GET` handler (not cached). Reads the **same filters** from `request.nextUrl.searchParams`, calls
`getMovers` (identical list to the UI), then:
- Fetch each card image server-side from the TCGplayer CDN (bounded by `limit`, deduped by
  `tcgplayerId`; skip rows with no `tcgplayerId`), with small concurrency.
- Build a **ZIP of images only** (filenames like `{rank}-{name}-{number}.jpg`) and return it:
  `Content-Type: application/zip`, `Content-Disposition: attachment; filename="gainers-YYYY-MM-DD.zip"`.
- Use **`jszip`** (new dependency) to assemble the archive as a Node buffer/stream.

---

## 6. Dependencies & config

- Add `jszip` (dependency), `tsx` (devDependency, make explicit).
- `package.json` scripts: add `"ingest"`.
- No change needed to `.env` (already has `JUSTTCG_API_KEY`, `DATABASE_URL`).

## Files touched
- `prisma/schema.prisma` (extend `CardVariant`, `Set`) + new migration
- `lib/db.ts` (optional WAL pragma)
- `lib/justtcg/{client,types,ingest}.ts`, `lib/images.ts`, `lib/trends.ts` (new)
- `scripts/ingest.ts` (new)
- `app/page.tsx` (rewrite), `app/_components/{Filters,CopyButton,ExportButton}.tsx` (new)
- `app/api/export/images/route.ts` (new)
- `package.json`

---

## Verification

1. **Schema**: `npx prisma migrate dev --name trends_fields` succeeds; `npm run db:studio` shows
   the new columns.
2. **Ingestion**: first `npm run ingest -- --set <slug>` (single set) — confirm it upserts a
   Game/Set/Cards/Variants and appends PriceSnapshots; verify rows + `priceChange7d` populated in
   Studio and that quota logging looks sane. Then run the full `npm run ingest` (~4–8 min at
   50 req/min) and confirm it completes the whole catalog in one pass.
3. **Query**: in a `tsx` scratch call, `getMovers({direction:"gainers"})` and `"losers"` return
   ranked rows within the price band.
4. **UI** (`npm run dev`, `/`): gainers/losers render with thumbnails; changing expansion + price
   range re-queries; Copy button copies the exact 4-line block; verify with Playwright MCP
   (`browser_navigate`, `browser_click`, read clipboard via `browser_evaluate`).
5. **Export**: click Batch Export → a `.zip` downloads containing the current list's images; open it
   to confirm the images match the ranked rows.

## Known constraints / risks
- **Starter quota (10k req/month)** comfortably covers a **once-daily full sync** (~300 req/day ≈
  ~9k/month). A full pass finishes in a single ~4–8 min run at 50 req/min. Avoid multiple full
  syncs per day (would risk the monthly ceiling); use `--incremental` if you want cheaper
  intra-day refreshes. Ingestion is idempotent and crash-resumable via `Set.lastSyncedAt`.
- TCGplayer CDN images depend on a valid `tcgplayerId`; rows without one are skipped in export
  (still shown in the list with a placeholder).
- Concurrent writes from dev server + ingest CLI: use WAL (noted) or run ingest while the app is idle.
