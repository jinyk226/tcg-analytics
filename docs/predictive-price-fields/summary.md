# Summary: 30d % column + predictive analytics fields

Branch `feature/predictive-price-fields`. Implements [`plan.md`](./plan.md); log in [`progress.md`](./progress.md).

## What Changed

- **New "30d %" column** on the movers list, right of "7d %" — a longer-horizon trend read (`priceChange30d`), reusing the stateless `PctBadge`.
- **Preemptively captured 29 predictive/technical fields** JustTCG already returns (the analysis found we were dropping the entire 30d/90d/1y/all-time suites). Stored raw for future supply/demand screening; composite signals will be derived in the query layer later.
- **Chosen not to seed `PriceSnapshot` from `priceHistory`** — it's only ~7 daily points per variant, not months, so the retroactive depth wasn't worth ~1.3M extra backfill upserts.
- **Full re-ingest backfill** run to populate the new fields across all sets.

Design driver: DB columns are ~free; the cost is the ~425-request backfill, identical whether we add 1 field or 29 — so we added the whole recommended set in one migration to avoid a second backfill later.

## New Files

| File | Purpose |
| --- | --- |
| `prisma/migrations/20260715082015_predictive_price_fields/` | Adds 29 nullable `CardVariant` columns + `priceChange30d` index. |
| `docs/predictive-price-fields/{plan,progress,summary}.md` | Design, execution log, this summary. |

## Modified Files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | 29 new `CardVariant` fields (momentum, trend slope, range position, MA, support/resistance + ATH/ATL dates, stddev/cov/iqr, reprice counts) + `@@index([priceChange30d])`. |
| `lib/justtcg/types.ts` | Extend `JtVariant` with all fields (`*AllTimeDate` as ISO strings). |
| `lib/justtcg/ingest.ts` | Map every field in `upsertVariant`; add `parseIsoDate()` helper. No priceHistory seeding. |
| `lib/trends.ts` | `MoverRow.pct30d` + select `priceChange30d`. |
| `app/page.tsx` | "30d %" column (header + tooltip + `PctBadge` cell). |
| `docs/README.md` | Index entry. |

## Tests Added

None (project convention favors end-to-end interface checks). Verified by:

- **Migration** — `PRAGMA table_info(card_variants)` shows all new columns; `prisma generate` clean.
- **Ingest** — `--set base-set-pokemon` populated `priceChange30d/90d`, `priceRelativeTo90dRange`, `trendSlope30d`, `priceChangesCount30d`, `maxPriceAllTime(+Date)` with sane values (e.g. Charizard: ch7 6.2% → ch30 22.7% → ch90 54.4%, pos90 1.0, ATH $773).
- **UI (Playwright)** — "30d %" header + tooltip render; re-ingested Base Set Charizard shows +22.7% (30d) beside +6.2% (7d); un-backfilled rows show "—" (null-tolerant); 0 console errors.
- `npm run lint` + `npm run build` clean.

## Incidental Fixes

None.

## Future

- **Query-layer composite signals** from the stored raws: MA-cross state, Bollinger %B, distance-to-ATH/drawdown, and a combined momentum/health score — all derivable without new columns.
- **A "predictive" sort/filter mode** once a scored heuristic is backtested against realized `priceChange`.
- **Honest caveat carried forward:** no volume field exists; `*Count` fields are an attention/liquidity proxy, and the dominant real drivers (reprints, rotation, tournaments, hype) aren't in this data. Treat as a screener, not a forecaster.
- **Rebase note:** `main` also has PR #1 (`exclude-and-multiselect-filters`); whichever merges second needs a trivial additive rebase (both touch `page.tsx`/`trends.ts`).
