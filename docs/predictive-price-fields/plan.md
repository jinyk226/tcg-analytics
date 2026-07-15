# Plan: 30d % column + predictive analytics fields

## Context

The movers tool ranks 7-day gainers/losers for daily videos. Two motivations here:

1. **Surface a 30-day % change** next to the 7-day move, for a longer-horizon trend read.
2. **Preemptively capture the predictive/technical fields JustTCG already returns** — so future
   supply/demand screening (momentum, mean-reversion, support/resistance, volatility regime) has
   data without another expensive backfill.

**The economic driver of the design:** DB columns are nearly free; the real cost is the
**re-ingest backfill (~425 API requests / one full sync)**. Every candidate field already rides
along in the *same* variant payload we fetch anyway — so adding one field later means another full
backfill. Therefore: **be generous with raw fields in this one migration.**

**Honest limitation (documented, not hidden):** JustTCG returns **no volume/quantity-sold field**.
Every "demand" signal here is a *repricing-frequency proxy* (the `*Count` fields) — weak. The real
price drivers (reprints, rotation, tournament results, hype) appear in none of these fields. So this
data powers a **screener / attention-ranker**, not a forecaster. Support/resistance (ATH, 1y high,
"last sold" anchors) is the one family where the behavioral intuition transfers well to collectibles.

### Decisions (from analysis + interview)

- **Add the 30d % display column** (`priceChange30d`), mirroring the existing 7d % column.
- **Add Tier 1 + Tier 2 predictive fields (29 total incl. 30d %)** — the full recommended set, since
  the backfill cost is identical whether we add 1 field or 29.
- **Store raw JustTCG fields only.** Composite signals (MA-cross, Bollinger %B, distance-to-ATH, any
  "health score") are *derived in the query layer later* — no columns, so weighting can evolve.
- **Do NOT seed `PriceSnapshot` from `priceHistory`.** Investigation found `priceHistory` is
  uniformly ~7 daily points (not months) across all sampled variants — only ~1 week of retroactive
  depth (≈ what snapshots accumulate in a week anyway), at a cost of ~1.3M extra upserts on backfill.
  Not worth it. `PriceSnapshot` keeps accruing one point/day going forward.
- **All new fields nullable + null-tolerant in the UI** — the page shows "—" for rows not yet
  re-ingested, so nothing breaks before/while the backfill runs (same pattern as the volatility fields).

---

## 1. Schema — `prisma/schema.prisma`

Add to `CardVariant` (all nullable). Migration `20260715082015_predictive_price_fields`.

- **Momentum:** `priceChange30d`, `priceChange90d` (7d already present).
- **Trend:** `trendSlope7d/30d/90d` (linear-regression slope).
- **Mean-reversion:** `priceRelativeTo30dRange`, `priceRelativeTo90dRange` (0..1 stochastic-style).
- **Moving averages:** `avgPrice30d`, `avgPrice90d` (MA-cross vs `latestPrice`).
- **Support/resistance:** `minPrice30d/maxPrice30d`, `minPrice90d/maxPrice90d`, `minPrice1y/maxPrice1y`,
  `minPriceAllTime`/`maxPriceAllTime` (+ their `*Date DateTime?` fields).
- **Dispersion:** `stddevPopPrice7d/30d/90d` (band width), `covPrice30d/90d` (unit-free screening),
  `iqrPrice7d/30d/90d` (outlier-resistant).
- **Volume proxy:** `priceChangesCount30d/90d` (repricing frequency — NOT true volume).
- Index: `@@index([priceChange30d])` (parity with `priceChange7d`; likely sort key).

## 2. Types + ingest — `lib/justtcg/types.ts`, `lib/justtcg/ingest.ts`

- `JtVariant`: add all fields above; `*AllTimeDate` are **ISO 8601 strings**.
- `upsertVariant`: map each with `?? null`; parse the two ISO date strings via a new `parseIsoDate()`
  helper (returns `Date | null`, guards `NaN`). No `priceHistory` handling.

## 3. Query + UI — `lib/trends.ts`, `app/page.tsx`

- `MoverRow`: add `pct30d: number | null`; select `priceChange30d` in the `getMovers` map.
- `app/page.tsx`: add a **"30d %"** column (header with tooltip + a `PctBadge pct={r.pct30d}` cell)
  immediately right of "7d %". Reuses the existing stateless `PctBadge`. No other UI change.

## 4. Backfill

Run `npm run ingest` (full sync, ~425 requests) to populate the new fields across all sets. Stop the
dev server + Prisma Studio first (DB single-writer lock). After `db:migrate`, run `prisma generate`
(stale-client guard). Null-tolerance means the UI works before this completes.

## Files touched

- `prisma/schema.prisma` (+ migration) — 29 new `CardVariant` fields + index.
- `lib/justtcg/types.ts` — extend `JtVariant`.
- `lib/justtcg/ingest.ts` — map fields + `parseIsoDate()` helper.
- `lib/trends.ts` — `MoverRow.pct30d` + select.
- `app/page.tsx` — "30d %" column.
- `docs/predictive-price-fields/{plan,progress,summary}.md`, `docs/README.md`.

---

## Verification

1. **Migrate/generate**: `npm run db:migrate` applies; `sqlite3 dev.db "PRAGMA table_info(card_variants)"` shows the new columns; `npx prisma generate` clean.
2. **Ingest one set**: `npm run ingest -- --set base-set-pokemon`; query confirms `priceChange30d/90d`, `priceRelativeTo90dRange`, `trendSlope30d`, `priceChangesCount30d`, `maxPriceAllTime(+Date)` populate with sane values.
3. **UI (Playwright)**: the "30d %" header + tooltip render; a re-ingested card (Base Set Charizard) shows a real 30d badge (+22.7%) beside its 7d (+6.2%); un-backfilled rows show "—" (null-tolerant).
4. **Lint/build**: `npm run lint` + `npm run build` clean.
5. **Backfill**: full `npm run ingest` completes; spot-check that 30d populates broadly across sets.

## Known constraints / risks

- **No volume data** — `*Count` fields are an attention/liquidity proxy, not demand. Don't oversell prediction.
- **Sparse stats on thin cards** — stddev/slope over few autocorrelated daily points understate uncertainty; a stale (un-repriced) card shows misleadingly low volatility. Gate future signals on activity count.
- **Backfill cost** — populating requires one full sync (~425 requests); until then most rows read null (handled by null-tolerance).
- **Not yet surfaced** — beyond the 30d % column, the new fields are stored for future query-layer signals; no UI/predictive scoring is built yet (deliberate).
- **`priceHistory`** stays unused; revisit only if JustTCG begins returning longer history.
