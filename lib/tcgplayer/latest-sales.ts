/**
 * TCGplayer "Latest Sales" — the internal endpoint behind the sales panel on a
 * product page. Unofficial: field names and behavior can change without notice.
 *
 * Two hard constraints, both verified against the live endpoint (2026-07-20):
 *
 *  1. The response is capped at **5 sales**. `limit` is ignored above 5, `offset`
 *     is ignored entirely, and `nextPage` is always empty — so there is no
 *     pagination and `totalResults` is the cap, not a real total. A "sales in the
 *     last N days" count is therefore not obtainable; the honest read is the
 *     inverse, "5 sales spanning N days".
 *  2. The cap is applied *after* server-side filtering, so narrowing to one
 *     condition/printing reaches meaningfully further back. Blaziken (83909)
 *     unfiltered spans 5 days; filtered to Near Mint it spans 50.
 *
 * Because of (2) we always filter server-side, which also means exactly one
 * request per card.
 */

const ENDPOINT = "https://mpapi.tcgplayer.com/v2/product/{pid}/latestsales";

/** Real browser headers are required — the endpoint 403s without them. */
const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://www.tcgplayer.com",
  Referer: "https://www.tcgplayer.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

/** Max rows the endpoint will return, regardless of `limit`. */
export const WINDOW_CAP = 5;

/**
 * Filter ids are numeric — string names are rejected with a 400. Both maps were
 * derived by scanning ids against products with known printings; they cover
 * every `condition`/`printing` value present in our DB.
 */
const CONDITION_IDS: Record<string, number> = {
  "Near Mint": 1,
  "Lightly Played": 2,
  "Moderately Played": 3,
  "Heavily Played": 4,
  Damaged: 5,
};

const VARIANT_IDS: Record<string, number> = {
  Normal: 10,
  Holofoil: 11,
  "Reverse Holofoil": 77,
  "1st Edition": 78,
  "1st Edition Holofoil": 79,
  Unlimited: 122,
  "Unlimited Holofoil": 123,
};

interface SaleRow {
  condition: string;
  variant: string;
  language: string;
  quantity: number;
  title: string;
  purchasePrice: number;
  shippingPrice: number;
  orderDate: string;
}

export interface SalesSummary {
  productId: string;
  /** Sales returned for this condition/printing (0–WINDOW_CAP). */
  count: number;
  /** True when count hit the cap — more sales exist beyond the window. */
  capped: boolean;
  /** ISO dates of the newest/oldest sale in the window; null when count is 0. */
  newest: string | null;
  oldest: string | null;
  /** Days from oldest to newest sale. */
  spanDays: number | null;
  /** Days since the most recent sale. */
  daysSinceLast: number | null;
  /** Median sale price (purchase + shipping), or null when count is 0. */
  medianPrice: number | null;
}

const DAY_MS = 86_400_000;

/**
 * Whether the sales window describes a market liquid enough to trust a 7-day
 * move from. "thin" is the case worth flagging: a big percentage swing on a card
 * that barely trades is usually an artifact of one or two listings, not demand.
 *
 * A window that isn't capped means those are *all* the sales TCGplayer will
 * surface, so a low count there is real scarcity rather than a display limit.
 */
export type Liquidity = "none" | "thin" | "healthy";

const THIN_MIN_COUNT = 3;
const THIN_STALE_DAYS = 14;
/** Fewer than one sale per ~10 days is too slow to read a 7-day move from. */
const THIN_SALES_PER_DAY = 0.1;

export function liquidityOf(s: SalesSummary): Liquidity {
  if (s.count === 0) return "none";
  if (s.count < THIN_MIN_COUNT) return "thin";
  if (s.daysSinceLast !== null && s.daysSinceLast > THIN_STALE_DAYS)
    return "thin";
  // Rate check, applied whether or not the window is capped: an uncapped window
  // can still be sparse (3 sales spread over 84 days is thin by any read), and a
  // capped one is a rate sample by construction. Guard the span floor so a
  // same-day cluster doesn't divide by ~0.
  if (
    s.spanDays !== null &&
    s.count / Math.max(s.spanDays, 1) < THIN_SALES_PER_DAY
  )
    return "thin";
  return "healthy";
}

/**
 * Cached summaries. Sales move slowly enough that a re-run within the TTL adds
 * nothing, and the cache is what keeps a 50-row sweep from re-hitting the
 * endpoint every time a filter changes.
 */
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; summary: SalesSummary }>();

function summarize(productId: string, rows: SaleRow[]): SalesSummary {
  if (rows.length === 0) {
    return {
      productId,
      count: 0,
      capped: false,
      newest: null,
      oldest: null,
      spanDays: null,
      daysSinceLast: null,
      medianPrice: null,
    };
  }

  const times = rows.map((r) => new Date(r.orderDate).getTime()).sort();
  const newest = times[times.length - 1];
  const oldest = times[0];

  const prices = rows
    .map((r) => r.purchasePrice + r.shippingPrice)
    .sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const medianPrice =
    prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

  return {
    productId,
    count: rows.length,
    capped: rows.length >= WINDOW_CAP,
    newest: new Date(newest).toISOString(),
    oldest: new Date(oldest).toISOString(),
    spanDays: Math.round(((newest - oldest) / DAY_MS) * 10) / 10,
    daysSinceLast: Math.round(((Date.now() - newest) / DAY_MS) * 10) / 10,
    medianPrice: Math.round(medianPrice * 100) / 100,
  };
}

/**
 * Fetch the latest-sales window for one product, narrowed to a condition and
 * printing. Unrecognized condition/printing names are simply left unfiltered
 * rather than throwing, so a new printing degrades to a wider window instead of
 * an error.
 */
export async function getLatestSales(
  productId: string,
  opts: { condition?: string | null; printing?: string | null } = {},
): Promise<SalesSummary> {
  const conditionId = opts.condition
    ? CONDITION_IDS[opts.condition]
    : undefined;
  const variantId = opts.printing ? VARIANT_IDS[opts.printing] : undefined;

  const key = `${productId}|${conditionId ?? ""}|${variantId ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.summary;

  const res = await fetch(ENDPOINT.replace("{pid}", productId), {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      conditions: conditionId ? [conditionId] : [],
      variants: variantId ? [variantId] : [],
      languages: [],
      listingType: "All",
      offset: 0,
      limit: WINDOW_CAP,
    }),
  });

  if (!res.ok) {
    throw new Error(`TCGplayer latest-sales ${productId}: HTTP ${res.status}`);
  }

  const body = (await res.json()) as { data?: SaleRow[] };
  const summary = summarize(productId, body.data ?? []);
  cache.set(key, { at: Date.now(), summary });
  return summary;
}
