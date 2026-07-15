# Plan: Exclude filter + multi-select Series

## Context

The 7-day movers list is used to build daily per-expansion videos. Two filtering gaps hurt that workflow:

1. **Series is single-select.** You can look at exactly one era at a time (or "All"). You often want a handful of modern eras together (e.g. Scarlet & Violet + Sword & Shield) without pulling in twenty years of back-catalog.
2. **No way to exclude "non-expansion" products.** World Championship Decks, Deck Exclusives, Prize Pack Series, Trainer Kits, and various junk Promo sets pollute the movers list with items that aren't part of a normal expansion release and aren't useful for the videos.

This iteration:
1. Converts the **Series** filter to **multi-select** (pick any subset of eras; empty = all).
2. Adds an **Exclude** multi-select that filters out curated product categories, **on by default**.
3. Renders both as **dropdown checkbox popovers** (a trigger button showing the label + active count, opening a panel of checkboxes with **Select all / Clear** shortcuts) that **batch** their changes until the popover closes or **Apply**.
4. Adds a **"Show all"** link that strips filters to a true see-everything view.
5. Threads both filters through the page query, the copy/list output, and the image-export route so the ZIP stays WYSIWYG.

**Key research findings driving the design:**

- **There is no category/type field.** `prisma/schema.prisma` `Set` has `name`, `code` (the JustTCG slug, e.g. `world-championship-decks-pokemon`), and a derived `series`. `series` is a chronological **era** (`lib/justtcg/series.ts`), not a product type — "World Championship Decks" is filed under "Sun & Moon". So series cannot identify special products.
- **The only reliable signal is `Set.code` (the slug).** Slugs are lowercase/hyphenated and stable. Exclusion is a **curated category → slug-pattern map**, mirroring the `SERIES_OVERRIDES` pattern in `lib/justtcg/series.ts`. All patterns below were verified against the live `dev.db`.
- **Prisma `contains` on SQLite is case-sensitive by default** — matching lowercase patterns against the lowercase `code` slug sidesteps casing. `code` is nullable; a null slug never matches (correct — we only exclude known products).
- **URL params are the single source of truth**, today flattened to their first value by `str()`/`num()` (`app/page.tsx`) and `.get()` (export route). Multi-select requires array-aware parsing (`getAll` / reading `string[]`).

### Decisions (from interview)

- **Three exclude categories, all ON by default:**
  - **`core` — "Special products":** `world-championship`, `deck-exclusive`, `deck-kit`, `prize-pack`, `trainer-kit`. (Matches 15 sets incl. WC Decks, Deck Exclusives, Prize Pack, all Trainer Kits, Ash-vs-Team-Rocket Deck Kit.)
  - **`promos` — "Promos":** *curated themed/event junk only* — `countdown-calendar`, `best-of-promos`, `pikachu-world-collection`, `player-placement`, `professor-program` (5 sets). **Deliberately NOT a blanket `promo` match:** the per-era Black Star main lines (SV/SWSH Promo Cards, SM/XY/HGSS/DP/BW Promos, ME Promo, Nintendo Promos) and Alternate-Art / WoTC promos stay **visible** because they carry genuine chase-card movers.
  - **`retailer` — "Retailer promos":** `mcdonald`, `burger-king`, `kids-wb`.
  - Special sub-collections were left out of scope (false-positive risk, e.g. "Legendary Collection").
- **Interaction model is mixed, by design:**
  - **Direction** stays **instant** (applies on click, as today).
  - **Series** and **Exclude** dropdowns **batch**: checking boxes stages a local draft; the change commits (re-queries) when the popover **closes** (outside-click / Escape / trigger toggle) or on **Apply**. Numeric inputs (price, Top N, quality caps) commit on **Apply**, unchanged.
  - Each dropdown has **Select all / Clear** shortcuts operating on the draft.
- **"Show all" control** (labeled literally **"Show all"**, not "Reset" — it does *not* restore the exclude-ON defaults): navigates to a see-everything view — series cleared (all), **exclude OFF** (`exclude=none`), **price limits removed** (min 0, no max), quality caps off. Preserves the current **Direction** and **Top N**.
- **Both filters shape copy + export** (WYSIWYG), consistent with the volatility-filter precedent.
- **Series default unchanged** — empty selection = all series (no sentinel). Only Exclude needs a `none` sentinel because its default is non-empty.

---

## 1. Exclude category definitions — `lib/exclude-categories.ts` (new)

Single source of truth for categories, labels, and slug patterns. All patterns verified against `dev.db`.

```ts
export interface ExcludeCategory {
  id: string;              // stable URL token: "core" | "promos" | "retailer"
  label: string;           // trigger / checkbox label
  slugPatterns: string[];  // lowercase substrings matched against Set.code
}

export const EXCLUDE_CATEGORIES: ExcludeCategory[] = [
  { id: "core",     label: "Special products", slugPatterns: ["world-championship", "deck-exclusive", "deck-kit", "prize-pack", "trainer-kit"] },
  // "Promos" = curated themed/event junk ONLY. Black Star main lines, Alt-Art, and WoTC promos stay visible.
  { id: "promos",   label: "Promos",           slugPatterns: ["countdown-calendar", "best-of-promos", "pikachu-world-collection", "player-placement", "professor-program"] },
  { id: "retailer", label: "Retailer promos",  slugPatterns: ["mcdonald", "burger-king", "kids-wb"] },
];

export const DEFAULT_EXCLUDE_IDS = EXCLUDE_CATEGORIES.map((c) => c.id);

/** Valid ids (for filtering junk out of URL params). */
export const EXCLUDE_IDS = new Set(DEFAULT_EXCLUDE_IDS);

/** Flatten a list of category ids to the slug patterns they cover. */
export function patternsFor(ids: string[]): string[] {
  return ids.flatMap((id) => EXCLUDE_CATEGORIES.find((c) => c.id === id)?.slugPatterns ?? []);
}
```

> Because `promos` is a curated list (not a blanket `promo`), the three categories are now **disjoint** — `retailer` no longer overlaps `promos`. Keep patterns specific (`deck-kit`, not `deck`) to avoid catching normal sets.

## 2. Query layer — `lib/trends.ts`

- **`MoverFilters`**: change `series?: string` → `series?: string[]`; add `excludeCategoryIds?: string[]`.
- **`getMovers` where clause** (currently line 84 for series):
  - Series (multi): `...(series && series.length ? { card: { set: { series: { in: series } } } } : {})`.
  - Exclude: push into the existing `qualityAnd: object[]` array (an independent `AND` entry, so it never collides with the series `card.set` key). Strict AND — exclude applies even when a series is selected:
    ```ts
    const patterns = patternsFor(excludeCategoryIds ?? []);
    if (patterns.length) {
      qualityAnd.push({
        NOT: { card: { set: { OR: patterns.map((p) => ({ code: { contains: p } })) } } },
      });
    }
    ```
- `getSeriesList()` unchanged (still the option source; returns A→Z distinct eras).

## 3. Page — `app/page.tsx`

- **New parse helper** `strArray(value: string | string[] | undefined): string[]` — normalizes to an array (`[]` when absent).
- **Series**: `series: strArray(sp.series).filter(Boolean)`. Pass `series: filters.series.length ? filters.series : undefined`.
- **Exclude (default-on):**
  ```ts
  const exclude = sp.exclude === undefined
    ? DEFAULT_EXCLUDE_IDS                                   // clean load → all excluded
    : strArray(sp.exclude).filter((id) => EXCLUDE_IDS.has(id)); // explicit (["none"] → [])
  ```
  Pass `excludeCategoryIds: filters.exclude.length ? filters.exclude : undefined`.
- **`FilterState`** (defined in `Filters.tsx`, imported here): `series: string[]`, `exclude: string[]`.
- **`exportQuery`**: switch from `URLSearchParams({...})` object form to appending arrays — `for (const s of filters.series) q.append("series", s)`, and mirror exclude (append each id, or `q.append("exclude", "none")` when empty so the route sees an explicit empty rather than defaulting).
- **Empty-state text** (lines 99–101): update the `filters.series` reference (now an array) — join names or drop the clause when multiple.
- **"Show all" target** is computed in `Filters.tsx` (§4), but note the price semantics: "no max" is encoded as a large sentinel `maxPrice` (e.g. `1000000`) so the existing `inBand = { gte, lte }` band passes effectively everything; `minPrice=0`.

## 4. Filters UI — `app/_components/Filters.tsx` + `app/_components/MultiSelect.tsx` (new)

**New `app/_components/MultiSelect.tsx`** (`"use client"`) — one reusable batching checkbox-dropdown, used for both Series and Exclude. Lives in `_components/` (owns state), not `_ui/`.
```ts
export function MultiSelect(props: {
  label: string;                              // "Series" | "Exclude"
  options: { value: string; label: string }[];
  selected: string[];                         // committed (URL) selection
  onChange: (next: string[]) => void;         // fired on popover CLOSE if draft changed
}): JSX.Element
```
- Trigger button shows `label` + active count (e.g. "Series (2)"; "Series · All" when none).
- **Batching:** opening seeds a local `draft` from `selected`. Checkboxes mutate `draft` only (no navigation). On **close** (outside-click / Escape / trigger toggle), if `draft` differs from `selected`, fire `onChange(draft)`.
- **Select all / Clear** header row acts on `draft`.
- Local `useState` for `open` + `draft` + a container ref for outside-click. Styling reuses toolbar tokens (border, `bg-background`, rounded) so it matches the Price/Top-N inputs.

**`app/_components/Filters.tsx`** changes:
- **`FilterState`**: `series: string[]`, `exclude: string[]` (was `series: string`).
- **`push()`** rewrite, array-aware:
  - Scalars (direction, prices, limit, maxPriceChanges, maxCov) unchanged (skip empties).
  - Series: `for (const s of series) params.append("series", s)`.
  - Exclude: **always emit** so post-interaction state is explicit — `exclude.length ? exclude.forEach((id) => params.append("exclude", id)) : params.append("exclude", "none")`.
- Replace the `<select>` block with two `<MultiSelect>` instances:
  - Series — `options` from `seriesList` (value = label = era), `selected={current.series}`, `onChange={(next) => push({ series: next })}`.
  - Exclude — `options` from `EXCLUDE_CATEGORIES` (`{ value: id, label }`, imported from `lib/exclude-categories`), `selected={current.exclude}`, `onChange={(next) => push({ exclude: next })}`.
- **Direction** toggle stays instant (unchanged — no pending/muted state).
- **"Show all"** link/button — navigates to `?<preserved direction & limit>&minPrice=0&maxPrice=1000000&exclude=none` (series omitted = all; quality caps omitted = off). Sits next to Apply.
- Widen the `push` patch type so `series`/`exclude` accept `string[]`.

## 5. Export route — `app/api/export/images/route.ts`

- **Series**: `const series = params.getAll("series");` → forward `series: series.length ? series : undefined`.
- **Exclude (default-on, same rule as the page):**
  ```ts
  const exclude = params.has("exclude")
    ? params.getAll("exclude").filter((id) => EXCLUDE_IDS.has(id))
    : DEFAULT_EXCLUDE_IDS;
  ```
  Forward `excludeCategoryIds: exclude.length ? exclude : undefined`. Import from `lib/exclude-categories`.

## 6. Docs

- **Update `docs/README.md`** — add this feature to `## Contents` with the two sub-bullet links (`plan.md` / `progress.md`).

## Files touched

- `lib/exclude-categories.ts` (new) — category → slug-pattern map + helpers.
- `lib/trends.ts` — `MoverFilters.series` → `string[]`, add `excludeCategoryIds`; `getMovers` where clause (series `in`, exclude `NOT/contains`).
- `app/page.tsx` — `strArray` helper; array parsing for series/exclude (exclude default-on); `exportQuery` append form; empty-state text.
- `app/_components/MultiSelect.tsx` (new) — batching checkbox-dropdown with Select all / Clear.
- `app/_components/Filters.tsx` — `FilterState` arrays; array-aware `push()`; two `<MultiSelect>` instances; "Show all" link. Direction unchanged.
- `app/api/export/images/route.ts` — `getAll` for series/exclude, exclude default-on, forward to `getMovers`.
- `docs/exclude-and-multiselect-filters/plan.md` (this file), `docs/exclude-and-multiselect-filters/progress.md`.
- `docs/README.md` — index entry.

---

## Verification

1. **Types/lint**: `npm run lint` and `npx tsc --noEmit` clean (esp. the `string → string[]` ripple across the 5 files).
2. **Series multi**: `/?series=Base&series=XY` shows only those two eras; `/?series=Base` (single) still works.
3. **Exclude default-on + promo split**: on a clean `/`, confirm **hidden**: World Championship / Deck Exclusives / Prize Pack / Trainer Kits / Countdown Calendar / Best Of / Pikachu World Collection / Player Placement / Professor Program / McDonald's / Burger King / Kids WB. Confirm **still visible**: SV & SWSH Promo Cards, SM/XY/HGSS/DP/BW Promos, ME Promo, Nintendo Promos, Alternate Art Promos, WoTC Promo. Spot-check with `sqlite3 dev.db "SELECT code FROM sets WHERE code LIKE '%promo%' ORDER BY code"`.
4. **Exclude toggle off + strict AND**: uncheck all exclude boxes → URL `exclude=none` → special/junk rows reappear; re-check → gone. With a series selected (e.g. Sun & Moon) AND `core` on, confirm WC Decks stay hidden (strict AND). Verify each category independently.
5. **Batching UX (Playwright MCP)**: open the Series dropdown, check several boxes — confirm **no navigation** until the popover closes, then the list updates. Confirm **Select all / Clear** work, the trigger count updates, Direction still applies instantly, and selections round-trip on reload.
6. **Show all**: click "Show all" → URL has `exclude=none`, `minPrice=0`, `maxPrice=1000000`, no `series` → list shows every-price, all-series, nothing excluded; Direction & Top N preserved.
7. **Export parity (WYSIWYG)**: for a given series/exclude selection, the ZIP file count matches the on-screen row count (dedup by tcgplayerId applies); `?exclude=none` yields the larger set.

## Known constraints / risks

- **Curated promo list is maintenance-bound**: new junk-promo sets won't be hidden until their slug substring is added to `promos`. This is the deliberate trade for keeping Black Star / Alt-Art / WoTC visible by default. The map is centralized in one file.
- **Categories are disjoint** now (curated `promos`), so `NOT(OR(patterns))` needs no dedup.
- **Default-on via `none` sentinel**: absent `exclude` = default (all three); the app must always emit the param once the user interacts (handled in `push()` §4 and both parsers §3/§5), or a shared "exclude nothing" URL would silently revert to default.
- **"Show all" price sentinel**: "no max" is `maxPrice=1000000`, not a true unbounded query — fine for this dataset (no single is near that). If ever needed, make the band's `lte` optional.
- **Prisma client staleness / DB write-lock** don't apply — no schema change, so no migrate/generate step.
- **Case sensitivity**: relies on `Set.code` being lowercase (it is, from JustTCG slugs); matching the slug rather than `name` is the deliberate guard.
