# Summary: Exclude filter + multi-select Series

Branch `feature/exclude-and-multiselect-filters`. Implements [`plan.md`](./plan.md); execution log in [`progress.md`](./progress.md).

## What Changed

- **Series is now multi-select.** Pick any subset of eras (empty = all). Backed by a Prisma `series: { in: [...] }` clause.
- **New Exclude filter, ON by default.** Three curated categories drop non-expansion products from the movers list by matching the JustTCG set slug (`Set.code`):
  - **Special products** (`core`) — World Championship Decks, Deck Exclusives, Deck Kits, Prize Pack Series, Trainer Kits.
  - **Promos** (`promos`) — *curated themed/event junk only* (Countdown Calendar, Best Of, Pikachu World Collection, Player Placement, Professor Program). Per-era Black Star main lines, Alt-Art, and WoTC promos stay **visible** by design.
  - **Retailer promos** (`retailer`) — McDonald's, Burger King, Kids WB.
- **Batching dropdown UI.** Series and Exclude render as checkbox popovers (with Select all / Clear) that stage changes locally and commit on close/Apply — no navigation mid-selection. Direction stays instant.
- **"Show all" control** — one click clears series, turns exclude off, and removes price limits for a true see-everything view (preserves Direction & Top N).
- **Default-on is URL-round-trippable** via a `none` sentinel: absent `exclude` param = all excluded; `exclude=none` = nothing excluded. Both the page and the image-export route honor it, so the ZIP mirrors the on-screen list (WYSIWYG).

## New Files

| File | Purpose |
| --- | --- |
| `lib/exclude-categories.ts` | Curated category → slug-pattern map (`EXCLUDE_CATEGORIES`, `DEFAULT_EXCLUDE_IDS`, `EXCLUDE_IDS`, `patternsFor()`). |
| `app/_components/MultiSelect.tsx` | Reusable batching checkbox dropdown (draft state, commit-on-close, Select all / Clear, outside-click/Escape). |
| `docs/exclude-and-multiselect-filters/{plan,progress,summary}.md` | Design, execution log, this summary. |

## Modified Files

| File | Change |
| --- | --- |
| `lib/trends.ts` | `MoverFilters.series` → `string[]`; add `excludeCategoryIds`; `getMovers` where clause (series `in`, exclude `NOT/contains` as a strict-AND `qualityAnd` entry). |
| `app/page.tsx` | `strArray()` helper; multi-series + default-on exclude parsing; append-based `exportQuery`; empty-state text; `key` on `<Filters>` to resync inputs after navigation. |
| `app/_components/Filters.tsx` | `FilterState` arrays; array-aware `push()` (always emits exclude); two `<MultiSelect>` instances replacing the `<select>`; "Show all" link. Direction unchanged. |
| `app/api/export/images/route.ts` | `getAll("series")`; exclude default-on (`has`/`getAll` + `none`); forward to `getMovers`. |
| `docs/README.md` | Index entry for this feature. |

## Tests Added

None (project convention favors end-to-end interface checks over unit tests). Verified instead by:

- **Query layer** — a scratch script drove real `getMovers` against `dev.db`: confirmed all `core`/`promos`/`retailer` sets are removed by default with **zero** wrongful removals of keep-visible sets (SV/SWSH Promo Cards, WoTC, Nintendo); `series: ["Base","XY"]` returns only those eras.
- **UI (Playwright)** — batching (no navigation until popover close), commit-on-close writes `series=…&exclude=core&promos&retailer` to the URL, list filters to Base+XY, "Show all" → `exclude=none&minPrice=0&maxPrice=1000000`, 0 console errors.
- **Export route** — `curl` of default and show-all queries both return `200 application/zip`; the `series=Base&XY` ZIP contains only Base/XY-era images.
- `npm run lint` + `npm run build` clean.

## Incidental Fixes

- **Toolbar input resync** — the Price/Top-N/quality inputs use local `useState` seeded once at mount, so a navigation that set them externally (the new "Show all") left stale text (e.g. "0.5–20") while results used the new band. Added a `key` on `<Filters>` derived from the mirrored numeric values so the component remounts and re-seeds on such navigations. Not in the original plan; surfaced during Playwright verification.

## Future

- **Sub-collection exclusions** (Radiant/Classic Collection, First Partner) were deliberately out of scope — high false-positive risk against real sets like "Legendary Collection".
- **Promo-list upkeep** — `promos` is a curated list, so newly-ingested junk-promo sets won't be hidden until their slug substring is added. The deliberate trade for keeping Black Star / Alt-Art / WoTC visible.
- **"Show all" price bound** uses a `maxPrice=1000000` sentinel rather than a truly unbounded query; fine for this dataset.
