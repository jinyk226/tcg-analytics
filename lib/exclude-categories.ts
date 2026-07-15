// Curated "exclude these product categories" map for the movers filter. There
// is no category field on Set — the only reliable signal is the JustTCG slug
// (Set.code), which is lowercase/hyphenated and stable. Each category is a set
// of lowercase substrings matched against that slug (Prisma `contains`, which is
// case-sensitive on SQLite — matching lowercase against the lowercase slug is
// intentional). Mirrors the SERIES_OVERRIDES approach in lib/justtcg/series.ts.

export interface ExcludeCategory {
  /** Stable URL token: "core" | "promos" | "retailer". */
  id: string;
  /** Trigger / checkbox label. */
  label: string;
  /** Lowercase substrings matched against Set.code. */
  slugPatterns: string[];
}

/**
 * The categories offered by the Exclude filter, all ON by default.
 *
 * `promos` is a *curated themed/event junk* list, NOT a blanket `promo` match:
 * the per-era Black Star main lines (SV/SWSH Promo Cards, SM/XY/HGSS/DP/BW
 * Promos, ME Promo, Nintendo Promos) and Alternate-Art / WoTC promos stay
 * visible because they carry genuine chase-card movers. New junk-promo sets
 * won't be hidden until their slug is added here — the deliberate trade.
 */
export const EXCLUDE_CATEGORIES: ExcludeCategory[] = [
  {
    id: "core",
    label: "Special products",
    slugPatterns: [
      "world-championship",
      "deck-exclusive",
      "deck-kit",
      "prize-pack",
      "trainer-kit",
    ],
  },
  {
    id: "promos",
    label: "Promos",
    slugPatterns: [
      "countdown-calendar",
      "best-of-promos",
      "pikachu-world-collection",
      "player-placement",
      "professor-program",
    ],
  },
  {
    id: "retailer",
    label: "Retailer promos",
    slugPatterns: ["mcdonald", "burger-king", "kids-wb"],
  },
];

/** All category ids, in offer order — also the default (everything excluded). */
export const DEFAULT_EXCLUDE_IDS: string[] = EXCLUDE_CATEGORIES.map(
  (c) => c.id,
);

/** Valid ids, for filtering junk out of URL params. */
export const EXCLUDE_IDS: ReadonlySet<string> = new Set(DEFAULT_EXCLUDE_IDS);

/** Flatten a list of category ids to the slug patterns they cover. */
export function patternsFor(ids: string[]): string[] {
  return ids.flatMap(
    (id) => EXCLUDE_CATEGORIES.find((c) => c.id === id)?.slugPatterns ?? [],
  );
}
