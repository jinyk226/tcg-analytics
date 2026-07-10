# Progress: JustTCG ingestion + 7-day gainers/losers export tool

Tracks execution of [`plan.md`](./plan.md). Ordered so each phase is independently verifiable
before the next depends on it. Status legend: `[ ]` todo · `[~]` in progress · `[x]` done.

**Status:** Not started — plan approved, awaiting go-ahead to execute.

---

## Phase 0 — Dependencies & config
- [ ] 0.1 Add `jszip` (dependency) and make `tsx` an explicit devDependency (`npm install`).
- [ ] 0.2 Add `"ingest": "tsx scripts/ingest.ts"` to `package.json` scripts.
- [ ] 0.3 Confirm `.env` has `JUSTTCG_API_KEY` and `DATABASE_URL` (no change expected).

## Phase 1 — Data model
- [ ] 1.1 Extend `CardVariant` in `prisma/schema.prisma`: `priceChange7d`, `priceChange24hr`,
      `avgPrice`, `minPrice7d`, `maxPrice7d`, `apiLastUpdated`.
- [ ] 1.2 Add `@@index([priceChange7d])` and `@@index([latestPrice])` to `CardVariant`.
- [ ] 1.3 Extend `Set`: `lastSyncedAt`, `setValueUsd?`, `setValueChange7dPct?`.
- [ ] 1.4 Run `npx prisma migrate dev --name trends_fields`; regenerate client.
- [ ] **Verify:** `npm run db:studio` shows the new columns. *(plan Verification #1)*

## Phase 2 — JustTCG client
- [ ] 2.1 `lib/justtcg/types.ts` — envelope + Card/Variant types.
- [ ] 2.2 `lib/justtcg/client.ts` — `getSets`, `getCardsPage`, `x-api-key` auth, 50 req/min
      throttle self-adjusting from `_metadata.apiRateLimit`, `QuotaExhaustedError`, page size 100.
- [ ] **Verify:** a scratch `tsx` call to `getSets("pokemon")` returns sets + logs quota.

## Phase 3 — Ingestion orchestration
- [ ] 3.1 `lib/justtcg/ingest.ts` — `syncGamePokemon()`: upsert Game → Sets → (per set) page
      cards, upsert Card + CardVariant, append daily PriceSnapshot, set `lastSyncedAt`.
- [ ] 3.2 Resume order (`lastSyncedAt asc nulls first`) + `--incremental` skip window.
- [ ] 3.3 `scripts/ingest.ts` — CLI with `--set`, `--max-sets`, `--incremental`, `--game`;
      per-set progress + quota logging.
- [ ] 3.4 (If needed) enable SQLite WAL in `lib/db.ts` for concurrent dev-server + ingest writes.
- [ ] **Verify:** `npm run ingest -- --set <slug>` populates rows incl. `priceChange7d`; then full
      `npm run ingest` completes the catalog in one ~4–8 min pass. *(plan Verification #2)*

## Phase 4 — Analytics query
- [ ] 4.1 `lib/images.ts` — `tcgplayerImageUrl(tcgplayerId)` (null-safe CDN URL).
- [ ] 4.2 `lib/trends.ts` — `getMovers({ direction, minPrice=0.5, maxPrice=20, setId?, limit=50 })`
      returning ranked `MoverRow[]` (per variant).
- [ ] **Verify:** scratch `tsx` call returns ranked gainers and losers within the price band.
      *(plan Verification #3)*

## Phase 5 — Frontend trends view
- [ ] 5.1 Rewrite `app/page.tsx` (Server Component, async `searchParams`, `force-dynamic`) to
      render ranked rows with thumbnails, value, and colored %change badge.
- [ ] 5.2 `app/_components/Filters.tsx` — expansion select, gainers/losers toggle, price-range
      inputs; push to URL query.
- [ ] 5.3 `app/_components/CopyButton.tsx` — copies the exact 4-line block.
- [ ] 5.4 `app/_components/ExportButton.tsx` — triggers the export route with current filters.
- [ ] **Verify:** `npm run dev`; filters re-query, copy button copies the block (Playwright MCP).
      *(plan Verification #4)*

## Phase 6 — Batch image export
- [ ] 6.1 `app/api/export/images/route.ts` — GET, reads same filters, `getMovers`, fetch images
      from TCGplayer CDN (dedupe by `tcgplayerId`, small concurrency), zip with `jszip`.
- [ ] 6.2 Response headers: `application/zip` + dated `Content-Disposition` filename.
- [ ] **Verify:** Batch Export downloads a `.zip` whose images match the ranked rows.
      *(plan Verification #5)*

## Phase 7 — Wrap-up
- [ ] 7.1 Update root `README.md` (ingest usage, trends view, export) + `AGENTS.md`/`CLAUDE.md` if
      conventions changed.
- [ ] 7.2 Commit in logical increments (schema, client, ingest, query, UI, export).
- [ ] 7.3 Mark this file complete; note roadmap follow-ups (automated daily schedule, Riftbound).
