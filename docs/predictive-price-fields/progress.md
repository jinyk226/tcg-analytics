# Progress: 30d % column + predictive analytics fields

Tracks execution of [`plan.md`](./plan.md). Ordered so each phase is independently verifiable.
Status legend: `[ ]` todo · `[~]` in progress · `[x]` done.

**Status:** ✅ Complete (2026-07-15) on branch `feature/predictive-price-fields`. Migration applied,
ingest maps all 29 fields, 30d % column verified via Playwright (real value on a re-ingested card,
null-tolerant "—" elsewhere), lint + build clean. Backfill done: 215 sets / 31,420 cards / 183,414
variants (~13 min, ~421 requests); 30d % populated on 171,362 variants (93% — the rest genuinely null
in the API), all-time-high on ~100%.

---

## Phase 1 — Schema
- [x] 1.1 Add 29 nullable fields to `CardVariant` (30d % + Tier 1 + Tier 2) + `@@index([priceChange30d])`.
- [x] 1.2 `npm run db:migrate` (`20260715082015_predictive_price_fields`) + `npx prisma generate`.
- [x] **Verify:** `PRAGMA table_info(card_variants)` shows the new columns *(plan Verification #1)*.

## Phase 2 — Types + ingest
- [x] 2.1 Extend `JtVariant` in `lib/justtcg/types.ts` (`*AllTimeDate` as ISO strings).
- [x] 2.2 Map all fields in `upsertVariant`; add `parseIsoDate()` helper. No priceHistory seeding.
- [x] **Verify:** `npm run ingest -- --set base-set-pokemon` populates fields with sane values *(plan Verification #2)*.

## Phase 3 — Query + UI
- [x] 3.1 `lib/trends.ts`: `MoverRow.pct30d` + select `priceChange30d`.
- [x] 3.2 `app/page.tsx`: "30d %" column (header + tooltip + `PctBadge`), right of 7d %.
- [x] **Verify:** column renders; Base Set Charizard shows +22.7% (30d) beside +6.2% (7d); "—" for un-backfilled rows *(plan Verification #3, #4)*.

## Phase 4 — Backfill
- [x] 4.1 Stop dev server + Prisma Studio (single-writer lock); run full `npm run ingest`.
- [x] **Verify:** 30d populates broadly across sets *(plan Verification #5)*.

## Phase 5 — Wrap-up
- [x] 5.1 Update `docs/README.md` `## Contents`.
- [x] 5.2 Lint + build clean; commit in small increments; push + PR.

### Roadmap follow-ups
- Build query-layer composite signals from the stored raws (MA-cross, %B, distance-to-ATH, a health score) — no schema change needed.
- Consider a "predictive" sort/filter mode once a scored heuristic is validated against realized `priceChange`.
- Rebase note: `main` also gained `feature/exclude-and-multiselect-filters` (PR #1); whichever merges second needs a trivial rebase (both touch `page.tsx`/`trends.ts` additively).
