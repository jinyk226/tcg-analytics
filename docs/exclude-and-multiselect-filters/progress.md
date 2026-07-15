# Progress: Exclude filter + multi-select Series

Tracks execution of [`plan.md`](./plan.md). Ordered so each phase is independently verifiable
before the next depends on it. Status legend: `[ ]` todo · `[~]` in progress · `[x]` done.

**Status:** ✅ Complete — shipped on branch `feature/exclude-and-multiselect-filters` (2026-07-15). Multi-select Series + default-on Exclude (3 curated categories) verified end-to-end: query logic against `dev.db`, batching dropdown / commit-on-close / Show all via Playwright, and export ZIP parity. Lint + build clean, 0 console errors.

---

## Phase 0 — Category definitions
- [x] 0.1 Create `lib/exclude-categories.ts`: `ExcludeCategory`, `EXCLUDE_CATEGORIES` (core / curated-promos / retailer), `DEFAULT_EXCLUDE_IDS`, `EXCLUDE_IDS`, `patternsFor()`.
- [x] **Verify:** `npx tsc --noEmit` clean; `patternsFor(["promos"])` returns the 5 themed-junk patterns; Black Star / Alt-Art / WoTC slugs match none.

## Phase 1 — Query layer
- [x] 1.1 `lib/trends.ts`: widen `MoverFilters.series` to `string[]`; add `excludeCategoryIds?: string[]`.
- [x] 1.2 `getMovers` where clause: series `{ in: [...] }`; exclude `NOT { card: { set: { OR: [{ code: { contains } }] } } }` pushed into `qualityAnd` (strict AND).
- [x] **Verify:** series-multi + exclude default-on returns expected rows; promo split correct *(plan Verification #2, #3, #4)*.

## Phase 2 — Page wiring
- [x] 2.1 `app/page.tsx`: add `strArray()`; parse `series` (multi) and `exclude` (default-on + `none` sentinel).
- [x] 2.2 Forward both to `getMovers`; rebuild `exportQuery` with `append`; update empty-state text.
- [x] **Verify:** `/?series=Base&series=XY` and clean `/` (default exclude) render correctly *(plan Verification #2, #3)*.

## Phase 3 — Filters UI
- [x] 3.1 Create `app/_components/MultiSelect.tsx`: batching checkbox dropdown (draft state, commit on close, Select all / Clear, outside-click/Escape).
- [x] 3.2 `app/_components/Filters.tsx`: `FilterState` arrays; array-aware `push()`; two `<MultiSelect>` instances replacing `<select>`; Direction stays instant; add "Show all" link.
- [x] **Verify:** batching (no nav until close), Select all/Clear, count, Show all, round-trip on reload *(plan Verification #5, #6)*.

## Phase 4 — Export route
- [x] 4.1 `app/api/export/images/route.ts`: `getAll("series")`; exclude default-on (`has`/`getAll` + `none`); forward to `getMovers`.
- [x] **Verify:** ZIP file count matches on-screen rows; `?exclude=none` yields the larger set *(plan Verification #7)*.

## Phase 5 — Wrap-up
- [x] 5.1 Update `docs/README.md` `## Contents` with this feature (plan.md / progress.md links).
- [x] 5.2 `npm run lint` + `npx tsc --noEmit` clean; commit in small increments.
- [x] 5.3 Mark this file ✅ Complete with concrete numbers + date; note roadmap follow-ups (e.g. sub-collection exclusions, promo-list upkeep).

### Incidental fix
- [x] Toolbar numeric inputs now resync after external navigation (e.g. "Show all") via a `key` on `<Filters>` — previously local `useState` showed stale price text while results used the new band.

### Roadmap follow-ups
- Sub-collection exclusions (Radiant/Classic Collection) were left out (false-positive risk vs "Legendary Collection").
- The `promos` curated list needs upkeep as new junk-promo sets are ingested (Alt-Art / WoTC / Black Star stay visible by design).
