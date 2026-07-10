import type { JtCard, JtMetadata, JtResponse, JtSet } from "./types";

const BASE_URL = "https://api.justtcg.com/v1";
const DEFAULT_RATE_LIMIT = 50; // Starter plan: 50 req/min
const PAGE_SIZE = 100; // Starter plan max cards/request

/** Thrown when the monthly or daily request quota is (nearly) exhausted. */
export class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Minimal JustTCG client. Self-throttles to the plan's per-minute rate limit
 * (read live from `_metadata.apiRateLimit`) and stops via QuotaExhaustedError
 * when the monthly/daily allowance runs out.
 */
export class JustTcgClient {
  private readonly apiKey: string;
  private ratePerMin = DEFAULT_RATE_LIMIT;
  private lastRequestAt = 0;
  /** Latest quota snapshot from the most recent response. */
  quota: JtMetadata = {};

  constructor(apiKey = process.env.JUSTTCG_API_KEY) {
    if (!apiKey) {
      throw new Error(
        "JUSTTCG_API_KEY is not set. Add it to .env before running ingestion.",
      );
    }
    this.apiKey = apiKey;
  }

  /** Enforce ~ratePerMin spacing between requests. */
  private async throttle() {
    const minSpacing = Math.ceil(60_000 / Math.max(1, this.ratePerMin));
    const wait = this.lastRequestAt + minSpacing - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<JtResponse<T>> {
    await this.throttle();

    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const res = await fetch(url, { headers: { "x-api-key": this.apiKey } });
    if (res.status === 429) {
      // Rate limited — back off a full window and let the caller retry.
      await sleep(60_000);
      throw new Error("Rate limited by JustTCG (429). Backed off 60s.");
    }
    if (!res.ok) {
      throw new Error(`JustTCG ${path} failed: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as JtResponse<T>;

    if (body._metadata) {
      this.quota = body._metadata;
      if (typeof body._metadata.apiRateLimit === "number") {
        // Respect the smaller of our default and the plan's stated limit.
        this.ratePerMin = Math.min(DEFAULT_RATE_LIMIT, body._metadata.apiRateLimit);
      }
      const monthly = body._metadata.apiRequestsRemaining;
      const daily = body._metadata.apiDailyRequestsRemaining;
      if ((typeof monthly === "number" && monthly <= 1) ||
          (typeof daily === "number" && daily <= 1)) {
        throw new QuotaExhaustedError(
          `JustTCG quota nearly exhausted (monthly=${monthly}, daily=${daily}).`,
        );
      }
    }

    return body;
  }

  /** All sets for a game, e.g. getSets("pokemon"). */
  async getSets(game: string): Promise<JtSet[]> {
    const body = await this.request<JtSet>("/sets", { game });
    return body.data;
  }

  /** One page of cards for a set (offset pagination). */
  async getCardsPage(
    game: string,
    setSlug: string,
    offset: number,
  ): Promise<{ cards: JtCard[]; hasMore: boolean }> {
    const body = await this.request<JtCard>("/cards", {
      game,
      set: setSlug,
      limit: PAGE_SIZE,
      offset,
    });
    return { cards: body.data, hasMore: body.meta?.hasMore ?? false };
  }

  /** Iterate every card in a set, paging until exhausted. */
  async *iterateSetCards(game: string, setSlug: string): AsyncGenerator<JtCard> {
    let offset = 0;
    for (;;) {
      const { cards, hasMore } = await this.getCardsPage(game, setSlug, offset);
      for (const card of cards) yield card;
      if (!hasMore || cards.length === 0) break;
      offset += cards.length;
    }
  }
}
