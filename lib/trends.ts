import { db } from "@/lib/db";
import { patternsFor } from "@/lib/exclude-categories";
import { tcgplayerImageUrl } from "@/lib/images";

export type MoverDirection = "gainers" | "losers";

export interface MoverRow {
  rank: number;
  variantId: number;
  name: string;
  number: string | null;
  setName: string | null;
  series: string | null;
  printing: string | null;
  condition: string | null;
  value: number | null; // latest price (USD)
  pct: number | null; // 7-day % change
  pct30d: number | null; // 30-day % change
  priceChanges7d: number | null; // # of discrete price changes over 7d (churn)
  cov7d: number | null; // coefficient of variation over 7d (dispersion)
  tcgplayerId: string | null;
  imageUrl: string | null;
}

export interface MoverFilters {
  direction: MoverDirection;
  minPrice?: number;
  maxPrice?: number;
  series?: string[];
  limit?: number;
  /** Exclude-category ids (see lib/exclude-categories). Sets whose slug matches
   *  any covered pattern are dropped. Undefined/empty = exclude nothing. */
  excludeCategoryIds?: string[];
  /** Quality guard: drop cards whose price changed more than this many times in
   *  the 7d window (thin/churny markets). Undefined/0 = no cap. */
  maxPriceChanges?: number;
  /** Quality guard: drop cards whose 7d coefficient of variation exceeds this.
   *  Undefined = no cap. Note COV rises with the size of a genuine move, so use
   *  sparingly — the churn cap is the primary quality filter. */
  maxCov?: number;
}

export const DEFAULT_MIN_PRICE = 0.5;
export const DEFAULT_MAX_PRICE = 20;
export const DEFAULT_LIMIT = 25;
/** Default churn cap: keep clean/steady moves, drop the extreme-thrash tail
 *  (empirically the ~34% of movers that change price 6+ times a week). */
export const DEFAULT_MAX_PRICE_CHANGES = 5;

/**
 * Ranked 7-day gainers or losers over Near-Mint English singles.
 *
 * Scope: condition = Near Mint (excludes Sealed), English, and only variants
 * with usable history (priceChange7d + avgPrice present). The price band matches
 * if EITHER the current price OR the 7-days-ago entry price falls in range, so
 * big movers that started in-band but have since left it still surface.
 */
export async function getMovers(filters: MoverFilters): Promise<MoverRow[]> {
  const {
    direction,
    minPrice = DEFAULT_MIN_PRICE,
    maxPrice = DEFAULT_MAX_PRICE,
    series,
    limit = DEFAULT_LIMIT,
    maxPriceChanges,
    maxCov,
    excludeCategoryIds,
  } = filters;

  const inBand = { gte: minPrice, lte: maxPrice };

  // Quality guards. Both are null-tolerant: a variant with no volatility data
  // (e.g. not yet re-ingested) passes rather than silently vanishing.
  const qualityAnd: object[] = [];
  if (maxPriceChanges && maxPriceChanges > 0) {
    qualityAnd.push({
      OR: [
        { priceChangesCount7d: null },
        { priceChangesCount7d: { lte: maxPriceChanges } },
      ],
    });
  }
  if (maxCov && maxCov > 0) {
    qualityAnd.push({
      OR: [{ covPrice7d: null }, { covPrice7d: { lte: maxCov } }],
    });
  }

  // Exclude curated product categories by matching the set slug. Kept as its own
  // AND entry so it never collides with the series `card.set` key below. Strict
  // AND: exclusions apply even when a series is explicitly selected.
  const excludePatterns = patternsFor(excludeCategoryIds ?? []);
  if (excludePatterns.length) {
    qualityAnd.push({
      NOT: {
        card: {
          set: { OR: excludePatterns.map((p) => ({ code: { contains: p } })) },
        },
      },
    });
  }

  const variants = await db.cardVariant.findMany({
    where: {
      condition: "Near Mint",
      language: "English",
      priceChange7d: { not: null },
      avgPrice: { not: null },
      ...(series && series.length
        ? { card: { set: { series: { in: series } } } }
        : {}),
      AND: [
        { OR: [{ latestPrice: inBand }, { startPrice7d: inBand }] },
        ...qualityAnd,
      ],
    },
    include: { card: { include: { set: true } } },
    orderBy: { priceChange7d: direction === "gainers" ? "desc" : "asc" },
    take: limit,
  });

  return variants.map((v, i) => ({
    rank: i + 1,
    variantId: v.id,
    name: v.card.name,
    number: v.card.number,
    setName: v.card.set?.name ?? null,
    series: v.card.set?.series ?? null,
    printing: v.printing,
    condition: v.condition,
    value: v.latestPrice,
    pct: v.priceChange7d,
    pct30d: v.priceChange30d,
    priceChanges7d: v.priceChangesCount7d,
    cov7d: v.covPrice7d,
    tcgplayerId: v.card.tcgplayerId,
    imageUrl: tcgplayerImageUrl(v.card.tcgplayerId),
  }));
}

/** Distinct series present in the DB, for the filter dropdown (A→Z). */
export async function getSeriesList(): Promise<string[]> {
  const rows = await db.set.findMany({
    where: { series: { not: null } },
    distinct: ["series"],
    select: { series: true },
    orderBy: { series: "asc" },
  });
  return rows.map((r) => r.series!).filter(Boolean);
}

/** Most recent set sync time, for the "data as of…" freshness badge. */
export async function getDataFreshness(): Promise<Date | null> {
  const row = await db.set.findFirst({
    where: { lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: "desc" },
    select: { lastSyncedAt: true },
  });
  return row?.lastSyncedAt ?? null;
}
