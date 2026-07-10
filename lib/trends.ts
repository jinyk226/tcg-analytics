import { db } from "@/lib/db";
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
  tcgplayerId: string | null;
  imageUrl: string | null;
}

export interface MoverFilters {
  direction: MoverDirection;
  minPrice?: number;
  maxPrice?: number;
  series?: string;
  limit?: number;
}

export const DEFAULT_MIN_PRICE = 0.5;
export const DEFAULT_MAX_PRICE = 20;
export const DEFAULT_LIMIT = 25;

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
  } = filters;

  const inBand = { gte: minPrice, lte: maxPrice };

  const variants = await db.cardVariant.findMany({
    where: {
      condition: "Near Mint",
      language: "English",
      priceChange7d: { not: null },
      avgPrice: { not: null },
      ...(series ? { card: { set: { series } } } : {}),
      OR: [{ latestPrice: inBand }, { startPrice7d: inBand }],
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
