import { db } from "@/lib/db";
import { JustTcgClient, QuotaExhaustedError } from "./client";
import { resolveSeries } from "./series";
import type { JtCard, JtSet, JtVariant } from "./types";

const GAME_KEY = "pokemon";
const ENGLISH = new Set(["English", "EN", "en"]);

export interface IngestOptions {
  /** Only sync this set slug (for quick testing). */
  onlySet?: string;
  /** Cap the number of sets processed this run. */
  maxSets?: number;
  /** Skip sets synced within this many hours. */
  incrementalHours?: number;
  /** Called after each set with a short progress line. */
  onProgress?: (line: string) => void;
}

/** Start-of-day (UTC) for the current run — snapshots dedupe per variant per day. */
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Entry ("7 days ago") price from current price + 7d % change. */
function computeStartPrice(price: number | undefined, pct: number | null | undefined) {
  if (typeof price !== "number" || typeof pct !== "number") return null;
  const factor = 1 + pct / 100;
  if (factor <= 0) return null;
  return price / factor;
}

/** Sync all Pokémon sets/cards/prices into the local DB. Idempotent & resumable. */
export async function syncGamePokemon(opts: IngestOptions = {}): Promise<{
  setsProcessed: number;
  cardsUpserted: number;
  variantsUpserted: number;
  stoppedEarly: boolean;
}> {
  const client = new JustTcgClient();
  const log = opts.onProgress ?? (() => {});

  const game = await db.game.upsert({
    where: { key: GAME_KEY },
    update: {},
    create: { key: GAME_KEY, name: "Pokémon" },
  });

  // Upsert the set catalog first so ordering/series are current.
  const apiSets = await client.getSets(GAME_KEY);
  for (const s of apiSets) {
    await upsertSet(game.id, s);
  }
  log(`catalog: ${apiSets.length} sets; quota monthly=${client.quota.apiRequestsRemaining} daily=${client.quota.apiDailyRequestsRemaining}`);

  // Decide which sets to process, least-recently-synced first (resumable).
  const cutoff = opts.incrementalHours
    ? new Date(Date.now() - opts.incrementalHours * 3_600_000)
    : null;

  const setsToProcess = await db.set.findMany({
    where: {
      gameId: game.id,
      ...(opts.onlySet ? { code: opts.onlySet } : {}),
      ...(cutoff ? { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }] } : {}),
    },
    orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    ...(opts.maxSets ? { take: opts.maxSets } : {}),
  });

  let setsProcessed = 0;
  let cardsUpserted = 0;
  let variantsUpserted = 0;
  let stoppedEarly = false;

  try {
    for (const set of setsToProcess) {
      if (!set.code) continue; // code holds the JustTCG slug
      let setCards = 0;
      let setVariants = 0;
      for await (const card of client.iterateSetCards(GAME_KEY, set.code)) {
        const { variants } = await upsertCardWithVariants(game.id, set.id, card);
        cardsUpserted += 1;
        setCards += 1;
        variantsUpserted += variants;
        setVariants += variants;
      }
      await db.set.update({ where: { id: set.id }, data: { lastSyncedAt: new Date() } });
      setsProcessed += 1;
      log(`  ${set.code}: ${setCards} cards, ${setVariants} EN variants | monthly=${client.quota.apiRequestsRemaining} daily=${client.quota.apiDailyRequestsRemaining}`);
    }
  } catch (err) {
    if (err instanceof QuotaExhaustedError) {
      stoppedEarly = true;
      log(`stopped early: ${err.message} — rerun to resume.`);
    } else {
      throw err;
    }
  }

  return { setsProcessed, cardsUpserted, variantsUpserted, stoppedEarly };
}

async function upsertSet(gameId: number, s: JtSet) {
  const releaseDate = s.release_date ? new Date(s.release_date) : null;
  const series = resolveSeries({ slug: s.id, releaseDate });
  const data = {
    name: s.name,
    code: s.id, // JustTCG set slug
    releaseDate,
    cardCount: s.count ?? null,
    series,
    setValueUsd: s.set_value_usd ?? null,
    setValueChange7dPct: s.set_value_change_7d_pct ?? null,
  };
  await db.set.upsert({
    where: { justTcgId: s.id },
    update: data,
    create: { justTcgId: s.id, gameId, ...data },
  });
}

async function upsertCardWithVariants(gameId: number, setId: number, card: JtCard) {
  const cardRow = await db.card.upsert({
    where: { justTcgId: card.id },
    update: {
      name: card.name,
      number: card.number ?? null,
      rarity: card.rarity ?? null,
      tcgplayerId: card.tcgplayerId ?? null,
      setId,
    },
    create: {
      justTcgId: card.id,
      gameId,
      setId,
      name: card.name,
      number: card.number ?? null,
      rarity: card.rarity ?? null,
      tcgplayerId: card.tcgplayerId ?? null,
    },
  });

  let count = 0;
  const recordedAt = todayUtc();
  for (const v of card.variants ?? []) {
    if (!ENGLISH.has(v.language ?? "English")) continue; // English-only scope
    await upsertVariant(cardRow.id, v, recordedAt);
    count += 1;
  }
  return { variants: count };
}

async function upsertVariant(cardId: number, v: JtVariant, recordedAt: Date) {
  const printing = v.printing ?? "Normal";
  const condition = v.condition ?? "Near Mint";
  const language = "English";
  const startPrice7d = computeStartPrice(v.price, v.priceChange7d);
  const apiLastUpdated = v.lastUpdated ? new Date(v.lastUpdated * 1000) : null;

  const data = {
    justTcgId: v.id ?? null,
    latestPrice: v.price ?? null,
    priceChange7d: v.priceChange7d ?? null,
    priceChange24hr: v.priceChange24hr ?? null,
    avgPrice: v.avgPrice ?? null,
    minPrice7d: v.minPrice7d ?? null,
    maxPrice7d: v.maxPrice7d ?? null,
    startPrice7d,
    apiLastUpdated,
    lastSeenAt: new Date(),
  };

  const variant = await db.cardVariant.upsert({
    where: {
      cardId_printing_condition_language: { cardId, printing, condition, language },
    },
    update: data,
    create: { cardId, printing, condition, language, ...data },
  });

  // Append today's price point (one per variant per day).
  if (typeof v.price === "number") {
    await db.priceSnapshot.upsert({
      where: { variantId_recordedAt: { variantId: variant.id, recordedAt } },
      update: { price: v.price },
      create: { variantId: variant.id, price: v.price, recordedAt },
    });
  }
}
