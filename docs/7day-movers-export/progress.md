# Progress: JustTCG ingestion + 7-day gainers/losers export tool

Tracks execution of [`plan.md`](./plan.md). Ordered so each phase is independently verifiable
before the next depends on it. Status legend: `[ ]` todo · `[~]` in progress · `[x]` done.

**Status:** ✅ Complete — full Pokémon catalog ingested (215 sets, 31,342 cards, 183,049 variants); UI, copy, and ZIP export verified end-to-end on 2026-07-10.

---

## Phase 0 — Dependencies & config
- [x] 0.1 Add `jszip` (dependency) and make `tsx` an explicit devDependency (`npm install`).
- [x] 0.2 Add `"ingest": "tsx scripts/ingest.ts"` to `package.json` scripts.
- [x] 0.3 Confirm `.env` has `JUSTTCG_API_KEY` and `DATABASE_URL` (no change expected).

## Phase 1 — Data model
- [x] 1.1 Extend `CardVariant`: `priceChange7d`, `priceChange24hr`, `avgPrice`, `minPrice7d`,
      `maxPrice7d`, **`startPrice7d`** (computed entry price), `apiLastUpdated`.
- [x] 1.2 Add indexes `@@index([priceChange7d])`, `@@index([latestPrice])`, `@@index([startPrice7d])`.
- [x] 1.3 Extend `Set`: `lastSyncedAt`, **`series`** (+ `@@index([series])`), `setValueUsd?`,
      `setValueChange7dPct?` (releaseDate already present).
- [x] 1.4 Run `npx prisma migrate dev --name trends_fields`; regenerate client.
- [x] **Verify:** `npm run db:studio` shows the new columns (incl. `startPrice7d`, `series`).
      *(plan Verification #1)*

## Phase 2 — JustTCG client & series map
- [x] 2.1 `lib/justtcg/types.ts` — envelope + Card/Variant types.
- [x] 2.2 `lib/justtcg/client.ts` — `getSets`, `getCardsPage`, `x-api-key` auth, 50 req/min
      throttle self-adjusting from `_metadata.apiRateLimit`, `QuotaExhaustedError`, page size 100.
- [x] 2.3 `lib/justtcg/series.ts` — `resolveSeries(set)`: curated slug→series map **+ release-date
      window fallback** → `"Uncategorized"`.
- [x] **Verify:** scratch `tsx` call to `getSets("pokemon")` returns sets + logs quota;
      `resolveSeries` maps known slugs and date-falls-back on an unmapped one.

## Phase 3 — Ingestion orchestration
- [x] 3.1 `lib/justtcg/ingest.ts` — `syncGamePokemon()`: upsert Game → Sets (set `series`,
      `releaseDate`, aggregates) → (per set) page cards; upsert Card; upsert **English** variants
      with all price fields incl. computed `startPrice7d`; append daily PriceSnapshot; set
      `lastSyncedAt`.
- [x] 3.2 Resume order (`lastSyncedAt asc nulls first`) + `--incremental` skip window.
- [x] 3.3 `scripts/ingest.ts` — CLI with `--set`, `--max-sets`, `--incremental`, `--game`;
      per-set progress + quota logging.
- [x] 3.4 (If needed) enable SQLite WAL in `lib/db.ts` for concurrent dev-server + ingest writes.
- [x] **Verify:** `npm run ingest -- --set <slug>` populates English rows incl. `priceChange7d`
      + `startPrice7d`, resolves `Set.series`; then full `npm run ingest` completes in one
      ~4–8 min pass. *(plan Verification #2)*

## Phase 4 — Analytics query
- [x] 4.1 `lib/images.ts` — `tcgplayerImageUrl(tcgplayerId, size?)` (null-safe) + fallback size order.
- [x] 4.2 `lib/trends.ts` — `getMovers({ direction, minPrice=0.5, maxPrice=20, series?, limit=25 })`
      returning ranked `MoverRow[]`: Near Mint + English + has-history, **either-end-in-band**
      filter, series scope. Plus `getSeriesList()` and `getDataFreshness()`.
- [x] **Verify:** scratch `tsx` calls return ranked Near-Mint English gainers/losers; a card that
      mooned past $20 but started in-band still appears. *(plan Verification #3)*

## Phase 5 — Frontend trends view
- [x] 5.1 Rewrite `app/page.tsx` (Server Component, async `searchParams`, `force-dynamic`):
      filter bar + freshness badge + one ranked list (rank, thumbnail, name#, printing, set, value,
      colored %change badge).
- [x] 5.2 `app/_components/Filters.tsx` — **series** select, Gainers|Losers toggle, price-range
      inputs (0.5–20), **Top-N** input (default 25); push to URL query.
- [x] 5.3 `app/_components/CopyButton.tsx` — copies the exact 4-line block (set + `Holofoil, NM`).
- [x] 5.4 `app/_components/ExportButton.tsx` — triggers the export route with current filters+limit.
- [x] 5.5 `app/_ui/*` — stateless presentational bits (price-change badge, row shell) per lint rule.
- [x] **Verify:** `npm run dev`; series/direction/band/Top-N re-query, freshness badge shows, copy
      copies the block (Playwright MCP `browser_evaluate` on clipboard). *(plan Verification #4)*

## Phase 6 — Batch image export
- [x] 6.1 `app/api/export/images/route.ts` — GET, reads same filters incl. `limit`, `getMovers`
      (exactly the Top-N shown), fetch images in rank order with **size fallback then skip**,
      dedupe by `tcgplayerId`, small concurrency; zip with `jszip`.
- [x] 6.2 **Rank-prefixed flat** filenames (`01_charizard-ex_223.jpg`, zero-padded); headers
      `application/zip` + `Content-Disposition: filename="pokemon-{direction}-YYYY-MM-DD.zip"`.
- [x] **Verify:** Batch Export downloads a rank-ordered `.zip`; file count matches shown rows minus
      any images that 404'd after fallback. *(plan Verification #5)*

## Phase 7 — Wrap-up
- [x] 7.1 Update root `README.md` (ingest usage, trends view, export). Confirm `CLAUDE.md`
      conventions still accurate (series map, `_ui`/`_components`).
- [x] 7.2 Run `npm run lint` + `npm run lint:quality` clean; commit in logical increments
      (schema, client+series, ingest, query, UI, export).
- [x] 7.3 Mark this file complete; note roadmap follow-ups (automated daily schedule, self-computed
      7d change from PriceSnapshot, sealed view, other languages, Riftbound).
