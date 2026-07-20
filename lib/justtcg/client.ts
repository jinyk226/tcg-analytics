import type { JtCard, JtMetadata, JtResponse, JtSet } from "./types";

const BASE_URL = "https://api.justtcg.com/v1";
const DEFAULT_RATE_LIMIT = 50; // Starter plan: 50 req/min
const PAGE_SIZE = 100; // Starter plan max cards/request
const MAX_RETRIES = 4; // per request; total attempts = MAX_RETRIES + 1

/** Thrown when the monthly or daily request quota is (nearly) exhausted. */
export class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

/** Internal marker for transient HTTP responses (429 / 5xx) worth retrying. */
class RetryableHttpError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RetryableHttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Transient network error codes (TLS/DNS/socket resets) worth retrying. */
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/** True for transient network failures. undici wraps the real cause, and often
 *  surfaces a bare `TypeError: fetch failed` for connection resets. */
function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  const causeCode = (err as { cause?: { code?: unknown } }).cause?.code;
  if (typeof code === "string" && RETRYABLE_NETWORK_CODES.has(code)) return true;
  if (typeof causeCode === "string" && RETRYABLE_NETWORK_CODES.has(causeCode)) {
    return true;
  }
  return err.name === "TypeError" && /fetch failed/i.test(err.message);
}

/** Exponential backoff with jitter: ~1s, 2s, 4s, 8s… capped at 30s. */
function backoffMs(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** attempt) + Math.floor(Math.random() * 500);
}

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
    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    // Retry transient failures (network resets, 429, 5xx) with backoff so a
    // single blip mid-run doesn't abort the whole ingest. Quota exhaustion and
    // permanent statuses (e.g. 404) fail fast.
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.throttle();
      try {
        const res = await fetch(url, { headers: { "x-api-key": this.apiKey } });

        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get("retry-after"));
          throw new RetryableHttpError(
            `JustTCG ${path} transient ${res.status} ${res.statusText}`,
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1_000
              : undefined,
          );
        }
        if (!res.ok) {
          throw new Error(
            `JustTCG ${path} failed: ${res.status} ${res.statusText}`,
          );
        }

        const body = (await res.json()) as JtResponse<T>;

        if (body._metadata) {
          this.quota = body._metadata;
          if (typeof body._metadata.apiRateLimit === "number") {
            // Respect the smaller of our default and the plan's stated limit.
            this.ratePerMin = Math.min(
              DEFAULT_RATE_LIMIT,
              body._metadata.apiRateLimit,
            );
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
      } catch (err) {
        // Quota exhaustion is terminal — never retry it.
        if (err instanceof QuotaExhaustedError) throw err;

        const retryable =
          err instanceof RetryableHttpError || isRetryableNetworkError(err);
        if (!retryable || attempt === MAX_RETRIES) throw err;

        lastErr = err;
        const wait =
          err instanceof RetryableHttpError && err.retryAfterMs
            ? err.retryAfterMs
            : backoffMs(attempt);
        await sleep(wait);
      }
    }
    // Unreachable — the loop either returns or throws — but satisfies the type checker.
    throw lastErr;
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
