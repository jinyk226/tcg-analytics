# Plan: JustTCG ingestion + 7-day gainers/losers export tool

## Context

`tcg-analytics` is a locally-run platform (Next.js 16 App Router + Prisma 7 / SQLite,
already set up) for turning JustTCG pricing data into quick, daily Adobe Premiere videos,
organized **by expansion series** (Scarlet & Violet, Sword & Shield, Mega Evolutions, …).
This iteration builds the first end-to-end workflow:

1. **Ingest** Pokémon cards/prices into the local DB (English variants), per set.
2. **Query** the DB for the **7-day greatest gainers and losers** (Near Mint singles),
   filterable by **series** and **price band** (default $0.50–$20).
3. **Act** on those lists: a per-row **copy** button and a **batch image export** (ZIP of
   card images) for the current Top-N list.

Key research findings driving the design:
- **JustTCG serves no images.** Images come from the **TCGplayer CDN** using each card's
  `tcgplayerId`: `https://tcgplayer-cdn.tcgplayer.com/product/{tcgplayerId}_in_1000x1000.jpg`.
- **JustTCG provides `priceChange7d` per variant** (a percentage) — we rank on it directly. We
  also write `PriceSnapshot` rows so our **own** 7d history accrues (see "% change source" below).
- **No series field in the API.** JustTCG exposes only individual sets; series/era grouping is
  ours to maintain.
- API: base `https://api.justtcg.com/v1`, header `x-api-key`. `GET /sets?game=pokemon`,
  `GET /cards?game=pokemon&set=<slug>&limit=<n>&offset=<n>` with `meta.hasMore` pagination.
  Prices USD. Every response echoes live quota in `_metadata` (`apiRateLimit` per-min,
  `apiRequestsRemaining` monthly, `apiDailyRequestsRemaining`).
- **Plan = Starter: 50 req/min, 100 cards/request, 10,000 requests/month.** A full Pokémon
  catalog pass ≈ total_cards ÷ 100 + 1 `/sets` call ≈ ~200–400 requests → a single ~4–8 min run.
  Once-daily full sync ≈ ~9k/month, under the cap. Throttle to live `apiRateLimit`; stop safely
  if `apiRequestsRemaining` nears zero.

### Decisions (from interview)
- **Images:** TCGplayer CDN via `tcgplayerId`. Missing image → try alternate CDN sizes, then skip.
- **Row unit:** one row **per variant**, but the movers view is scoped to **Near Mint** →
  effectively one row per printing (Normal/Holo/Reverse) per card.
- **Scope:** **English** variants only; **exclude sealed** (implicit — Near Mint filter excludes
  the "Sealed" condition); require **usable price history** (non-null `priceChange7d` + `avgPrice`).
- **Ingest breadth:** **all Pokémon expansions**.
- **Series grouping:** curated set-slug→series map **+ release-date fallback** for unmapped sets.
- **List size:** **configurable, default Top 25** per direction.
- **Layout:** **toggle** Gainers | Losers (one list at a time).
- **Price band basis:** **either end in band** — include if the current price OR the 7-days-ago
  entry price is within [min, max]. (Keeps big movers that started in-band but have shot past $20.)
- **Export:** ZIP of **images only**, **exactly the Top-N shown**, **rank-prefixed flat**
  filenames (`01_charizard-ex_223.jpg`) for correct Premiere import order; current direction only.
- **% change source:** rank/display **JustTCG's `priceChange7d`**; also **store both** (keep our
  `PriceSnapshot` history so a self-computed 7d change can be surfaced later behind a toggle).
- **Freshness UI:** show a **"data as of <lastSyncedAt>"** badge only — sync stays a CLI job.
- **Copy format** (per row):
  ```
  {name} (#{number}) — {printing}, NM
  {setName}
  ${value}
  {+/-}{pct}% (7d)
  ```

Next.js 16 specifics to honor: Route Handler `params`/`searchParams` are **async**; GET route
handlers are **not cached by default**; read query params via `request.nextUrl.searchParams`;
Server Components query Prisma directly; copy/export buttons are `"use client"`.

---

## 1. Data model changes — `prisma/schema.prisma`

Migration via `npx prisma migrate dev --name trends_fields` (DB is empty, safe).

**`CardVariant`** — add:
- `priceChange7d   Float?`  (JustTCG %; the ranking key)
- `priceChange24hr Float?`
- `avgPrice        Float?`  (also gates "has price history")
- `minPrice7d      Float?`, `maxPrice7d Float?`
- `startPrice7d    Float?`  (computed at ingest = `latestPrice / (1 + priceChange7d/100)`; the
  "7-days-ago" price used for the *either-end-in-band* filter; null when `priceChange7d` is null)
- `apiLastUpdated  DateTime?`  (from variant `lastUpdated` epoch seconds)
- Indexes: `@@index([priceChange7d])`, `@@index([latestPrice])`, `@@index([startPrice7d])`.
  Keep existing `latestPrice`, `condition`, `printing`, `language`,
  `@@unique([cardId, printing, condition, language])`.

**`Set`** — add:
- `lastSyncedAt DateTime?`  (resumable ingestion + freshness badge)
- `series       String?`    (era, e.g. "Scarlet & Violet"; from the curated map / date fallback)
- `@@index([series])`
- optional aggregates: `setValueUsd Float?`, `setValueChange7dPct Float?`
- (`releaseDate` already present — drives the series date fallback)

`Card.tcgplayerId` already exists — the image + copy key (no image URL stored; derived).

---

## 2. JustTCG ingestion layer — `lib/justtcg/`

**`lib/justtcg/client.ts`** — thin fetch wrapper (native `fetch`, Node 22):
- Base URL + `x-api-key` header from `process.env.JUSTTCG_API_KEY` (throw if missing).
- `getSets(game)`, `getCardsPage(game, setSlug, { limit, offset })` → `{ data, meta, metadata }`.
- **Throttle to 50 req/min** self-adjusting from `_metadata.apiRateLimit` (~1.2s min spacing).
  Surface `apiRequestsRemaining`/`apiDailyRequestsRemaining`; throw `QuotaExhaustedError` near 0.
- **Page size = 100** (Starter max).

**`lib/justtcg/types.ts`** — response/envelope + Card/Variant field types.

**`lib/justtcg/series.ts`** — `resolveSeries(set): string`:
- A **curated `Record<setSlug, series>`** map (Scarlet & Violet, Sword & Shield, Sun & Moon,
  Mega Evolutions, …). If a slug isn't mapped, **fall back to a release-date window**
  (e.g. ≥2023-01 → "Scarlet & Violet", 2019–2022 → "Sword & Shield", …); else `"Uncategorized"`.
  Adding a newly-released set = a one-line map edit.

**`lib/justtcg/ingest.ts`** — `syncGamePokemon()`, idempotent & resumable; completes a **full
catalog pass in one run** (`lastSyncedAt` = crash-resume, not multi-day trickle):
1. Upsert `Game{ key:"pokemon" }` (log ETA from `cards_count/100`).
2. `getSets("pokemon")` → upsert each `Set`; set `series = resolveSeries(set)`, `releaseDate`,
   aggregates.
3. Process sets **ordered by `lastSyncedAt asc nulls first`**. For each set, page `/cards`; per card:
   - upsert `Card` (by `justTcgId`; `gameId`, `setId`, `name`, `number`, `rarity`, `tcgplayerId`);
   - for each variant **where `language === "English"`**: upsert `CardVariant` (unique
     `[cardId,printing,condition,language]`) writing `latestPrice`, `priceChange7d`,
     `priceChange24hr`, `avgPrice`, `min/maxPrice7d`, **`startPrice7d`** (computed),
     `apiLastUpdated`, `lastSeenAt`. (All conditions/printings are stored; the Near-Mint scope is
     applied at query time, not here.)
   - append `PriceSnapshot` (unique `[variantId, recordedAt-day]`).
   - after a set fully pages, set `lastSyncedAt = now()`.
4. Normally finishes all sets in one run; `QuotaExhaustedError` (safety net) stops cleanly.
5. `--incremental`: skip sets synced within N hours.
- Reuse the shared `db` from `lib/db.ts`. **Cadence:** once daily (roadmap: automate the schedule).

**`scripts/ingest.ts`** — CLI via `tsx` (not a request handler — avoids timeouts; better-sqlite3
is a synchronous single-writer). Flags: `--set <slug>`, `--max-sets <n>`, `--incremental`,
`--game pokemon`. Logs per-set progress + remaining quota. `package.json`:
`"ingest": "tsx scripts/ingest.ts"`.

> `tsx` added as an explicit devDependency. If dev server + ingest write concurrently, enable
> SQLite WAL (PRAGMA in `lib/db.ts`) to avoid lock contention.

---

## 3. Analytics query — `lib/trends.ts`

One reusable function used by **both** the page and the export route (single source of truth):

```ts
getMovers({ direction: "gainers"|"losers", minPrice=0.5, maxPrice=20,
            series?, limit=25 }): Promise<MoverRow[]>
```
- Query `CardVariant` where:
  - `condition = "Near Mint"` (this also excludes "Sealed"),
  - `language = "English"`,
  - `priceChange7d != null` **and** `avgPrice != null` (has usable history),
  - **band, either end:** `(latestPrice BETWEEN min,max) OR (startPrice7d BETWEEN min,max)`,
  - `card.set.series = series` (when provided);
  - `include: { card: { include: { set: true } } }`,
  - `orderBy: { priceChange7d: direction==="gainers" ? "desc" : "asc" }`, `take: limit`.
- Map to `MoverRow`: `{ rank, variantId, name, number, setName, series, printing, condition,
  value, pct, tcgplayerId, imageUrl }`.
- `getSeriesList()` — distinct non-null `Set.series` for the filter dropdown.
- `getDataFreshness()` — `max(Set.lastSyncedAt)` for the badge.
- **`lib/images.ts`** → `tcgplayerImageUrl(tcgplayerId, size?)` builds the CDN URL (null-safe);
  exposes the fallback size order for the export route.

---

## 4. Frontend — trends view at `app/page.tsx` (replaces boilerplate)

Server Component; reads async `searchParams` (`direction`, `minPrice`, `maxPrice`, `series`,
`limit`) and calls `getMovers` + `getSeriesList` + `getDataFreshness`.
`export const dynamic = "force-dynamic"`.

Layout: a filter bar (series dropdown, Gainers|Losers toggle, min/max price, Top-N limit) + a
**"Data as of <lastSyncedAt>"** freshness badge, then one ranked list. Each row: rank, card
thumbnail (`<img>` from `imageUrl`), name (#number), printing, set, value, colored `priceChange7d`
badge, and a **Copy** button. A **Batch Export** button exports the current Top-N.

**Client components** (`app/_components/`, stateful containers per the `_ui`/`_components` rule):
- `Filters.tsx` — series `<select>` (options from `getSeriesList`), direction toggle, min/max
  price inputs (default 0.5–20), Top-N input (default 25); pushes to the URL query so the Server
  Component re-queries.
- `CopyButton.tsx` — `navigator.clipboard.writeText` of the exact 4-line block above.
- `ExportButton.tsx` — builds the current query string and hits `/api/export/images?<filters>` to
  download the ZIP (pending state).

Purely presentational pieces (e.g. the price-change badge, row shell) live in `app/_ui/` and stay
stateless per the lint rule.

> Card thumbnails use a plain `<img>` (remote CDN) to avoid `next/image` `remotePatterns` config.

---

## 5. Batch image export — `app/api/export/images/route.ts`

`GET` handler (not cached). Reads the **same filters** (incl. `limit`) from
`request.nextUrl.searchParams`, calls `getMovers` (identical Top-N to the UI), then:
- For each row **in rank order**, fetch the image from the TCGplayer CDN: try
  `_in_1000x1000.jpg`, then a fallback size (e.g. `_in_400x400.jpg`); if all fail, **skip** that
  card. Dedupe by `tcgplayerId`; small concurrency.
- Build a **ZIP of images only**, **rank-prefixed flat** filenames zero-padded to the list width:
  `{01}_{slugified-name}_{number}.jpg`.
- Return it: `Content-Type: application/zip`,
  `Content-Disposition: attachment; filename="pokemon-{direction}-YYYY-MM-DD.zip"`.
- Assemble with **`jszip`** (new dependency).

---

## 6. Dependencies & config

- Add `jszip` (dependency), `tsx` (devDependency, explicit).
- `package.json` scripts: add `"ingest"`.
- `.env` unchanged (already has `JUSTTCG_API_KEY`, `DATABASE_URL`).

## Files touched
- `prisma/schema.prisma` (extend `CardVariant`, `Set`) + new migration
- `lib/db.ts` (optional WAL pragma)
- `lib/justtcg/{client,types,series,ingest}.ts`, `lib/images.ts`, `lib/trends.ts` (new)
- `scripts/ingest.ts` (new)
- `app/page.tsx` (rewrite), `app/_components/{Filters,CopyButton,ExportButton}.tsx`,
  `app/_ui/*` (presentational bits) (new)
- `app/api/export/images/route.ts` (new)
- `package.json`

---

## Verification

1. **Schema**: `npx prisma migrate dev --name trends_fields` succeeds; `npm run db:studio` shows
   the new columns (`startPrice7d`, `Set.series`, …).
2. **Ingestion**: `npm run ingest -- --set <slug>` (single set) — confirm English variants upsert
   with `priceChange7d`/`startPrice7d` populated, `Set.series` resolved, PriceSnapshots appended;
   quota logs sane. Then full `npm run ingest` completes the catalog in one ~4–8 min pass.
3. **Query**: scratch `tsx` calls to `getMovers({direction:"gainers"})` / `"losers"` return
   ranked Near-Mint English rows honoring the either-end-in-band filter and series scope; verify a
   card that mooned past $20 (but started in-band) still appears.
4. **UI** (`npm run dev`, `/`): series filter + Gainers/Losers toggle + price band + Top-N
   re-query; freshness badge shows; Copy copies the exact 4-line block (verify via Playwright MCP
   `browser_evaluate` on the clipboard).
5. **Export**: Batch Export downloads `pokemon-gainers-YYYY-MM-DD.zip`; filenames are rank-ordered
   (`01_…`), count matches the shown rows minus any images that 404'd after fallback.

## Known constraints / risks
- **Series map upkeep:** new sets need a one-line map addition (date fallback covers the gap
  meanwhile). Curated map lives in `lib/justtcg/series.ts`.
- **Starter quota** covers a once-daily full sync (~9k/10k month). Avoid multiple full syncs/day;
  use `--incremental` for cheaper intra-day refreshes. Idempotent + crash-resumable via
  `Set.lastSyncedAt`.
- **Scope filters** (English + Near Mint + has-history) are applied at query time over fully
  ingested data, so widening scope later needs no re-ingest.
- **TCGplayer CDN** images depend on a valid `tcgplayerId` and URL pattern; rows without one (or
  whose image 404s after fallback) are skipped in export (still listed with a placeholder in UI).
- **PriceSnapshot growth:** ~one row/variant/day. Fine for SQLite near-term; revisit retention if
  it balloons. This history is what later powers our own (non-JustTCG) 7d computation.
