// Types for the JustTCG REST API v1 (https://api.justtcg.com/v1).
// Only the fields we actually consume are modeled; the API returns more.

/** A priceable printing × condition of a card. All prices are USD. */
export interface JtVariant {
  id?: string;
  condition?: string; // "Near Mint", "Lightly Played", "Sealed", ...
  printing?: string; // "Normal", "Holofoil", "Reverse Holofoil", ...
  language?: string; // "English", "Japanese", ...
  price?: number; // current market price
  priceChange24hr?: number | null; // percent
  priceChange7d?: number | null; // percent — our ranking key
  avgPrice?: number | null; // 7-day average
  minPrice7d?: number | null;
  maxPrice7d?: number | null;
  priceChangesCount7d?: number | null; // # of discrete price changes over 7d
  covPrice7d?: number | null; // coefficient of variation (stddev/mean) over 7d
  lastUpdated?: number; // epoch seconds
}

/** A card. Cards carry no price directly — pricing lives on `variants`. */
export interface JtCard {
  id: string; // canonical external id
  name: string;
  game?: string;
  set?: string; // set slug
  set_name?: string;
  number?: string;
  rarity?: string | null;
  tcgplayerId?: string | null;
  variants?: JtVariant[];
}

/** A set / expansion within a game. */
export interface JtSet {
  id: string; // slug
  name: string;
  game?: string;
  gameId?: string;
  count?: number; // card count
  release_date?: string | null;
  set_value_usd?: number | null;
  set_value_change_7d_pct?: number | null;
}

/** Offset-pagination envelope echoed on list responses. */
interface JtMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Live quota/plan info echoed on every response. */
export interface JtMetadata {
  apiPlan?: string;
  apiRateLimit?: number; // requests/minute
  apiRequestsRemaining?: number; // monthly
  apiDailyRequestsRemaining?: number;
}

export interface JtResponse<T> {
  data: T[];
  meta?: JtMeta;
  _metadata?: JtMetadata;
}
