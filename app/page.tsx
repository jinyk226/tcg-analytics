import { Filters, type FilterState } from "@/app/_components/Filters";
import { CopyButton } from "@/app/_components/CopyButton";
import { ExportButton } from "@/app/_components/ExportButton";
import { PctBadge } from "@/app/_ui/PctBadge";
import { tcgplayerImageUrl } from "@/lib/images";
import {
  DEFAULT_LIMIT,
  DEFAULT_MAX_PRICE,
  DEFAULT_MAX_PRICE_CHANGES,
  DEFAULT_MIN_PRICE,
  getDataFreshness,
  getMovers,
  getSeriesList,
  type MoverDirection,
  type MoverRow,
} from "@/lib/trends";
import { DEFAULT_EXCLUDE_IDS, EXCLUDE_IDS } from "@/lib/exclude-categories";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function num(value: string | string[] | undefined, fallback: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Normalize a repeated search param to an array ([] when absent). */
function strArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** The exact 4-line clipboard block for a row. */
function copyText(r: MoverRow): string {
  const head = r.number ? `${r.name} (#${r.number})` : r.name;
  const variant = [r.printing, "NM"].filter(Boolean).join(", ");
  const value = r.value != null ? `$${r.value.toFixed(2)}` : "$—";
  const pct =
    r.pct != null ? `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(1)}% (7d)` : "";
  return [`${head} — ${variant}`, r.setName ?? "", value, pct]
    .filter(Boolean)
    .join("\n");
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  // Exclude is ON by default: an absent `exclude` param means "exclude all
  // categories"; an explicit param (incl. the `none` sentinel → []) is honored.
  const exclude =
    sp.exclude === undefined
      ? [...DEFAULT_EXCLUDE_IDS]
      : strArray(sp.exclude).filter((id) => EXCLUDE_IDS.has(id));

  const filters: FilterState = {
    direction: (str(sp.direction) === "losers"
      ? "losers"
      : "gainers") as MoverDirection,
    minPrice: num(sp.minPrice, DEFAULT_MIN_PRICE),
    maxPrice: num(sp.maxPrice, DEFAULT_MAX_PRICE),
    series: strArray(sp.series).filter(Boolean),
    exclude,
    limit: Math.max(1, Math.min(200, num(sp.limit, DEFAULT_LIMIT))),
    maxPriceChanges: Math.max(
      0,
      num(sp.maxPriceChanges, DEFAULT_MAX_PRICE_CHANGES),
    ),
    maxCov: Math.max(0, num(sp.maxCov, 0)),
  };

  const [rows, seriesList, freshness] = await Promise.all([
    getMovers({
      direction: filters.direction,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      series: filters.series.length ? filters.series : undefined,
      excludeCategoryIds: filters.exclude.length ? filters.exclude : undefined,
      limit: filters.limit,
      maxPriceChanges: filters.maxPriceChanges || undefined,
      maxCov: filters.maxCov || undefined,
    }),
    getSeriesList(),
    getDataFreshness(),
  ]);

  // Query string mirroring the current filters, for the export download (so the
  // ZIP matches exactly what's on screen). The volatility metrics are excluded
  // from copy/filenames, but the quality filters still shape the list.
  const exportParams = new URLSearchParams({
    direction: filters.direction,
    minPrice: String(filters.minPrice),
    maxPrice: String(filters.maxPrice),
    limit: String(filters.limit),
    maxPriceChanges: String(filters.maxPriceChanges),
    ...(filters.maxCov ? { maxCov: String(filters.maxCov) } : {}),
  });
  for (const s of filters.series) exportParams.append("series", s);
  // Always emit exclude so the route sees the exact on-screen state (default-on
  // otherwise; `none` marks an explicit empty selection). Mirrors Filters.push().
  if (filters.exclude.length) {
    for (const id of filters.exclude) exportParams.append("exclude", id);
  } else {
    exportParams.append("exclude", "none");
  }
  const exportQuery = exportParams.toString();

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Pokémon 7-Day Movers
          </h1>
          <p className="mt-1 text-sm opacity-60">
            {freshness
              ? `Data as of ${freshness.toLocaleString()}`
              : "No data yet — run `npm run ingest`."}
          </p>
        </div>
        <ExportButton query={exportQuery} />
      </header>

      {/* Key on the numeric fields the toolbar mirrors in local state, so a
          navigation that changes them externally (e.g. "Show all") remounts the
          inputs to reflect the applied values instead of showing stale text. */}
      <Filters
        key={`${filters.minPrice}-${filters.maxPrice}-${filters.limit}-${filters.maxPriceChanges}-${filters.maxCov}`}
        seriesList={seriesList}
        current={filters}
      />

      <div className="mt-6 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm opacity-60">
            No {filters.direction} in ${filters.minPrice}–${filters.maxPrice}
            {filters.series.length ? ` for ${filters.series.join(", ")}` : ""}.
            Try widening the band or running an ingest.
          </p>
        ) : (
          <>
            {/* Column header (aligns with the right-side cells of each row). */}
            <div className="flex items-center gap-4 border-b border-black/10 px-3 py-2 text-[11px] font-medium uppercase tracking-wide opacity-45 dark:border-white/10">
              <span className="w-6 shrink-0" />
              <span className="w-12 shrink-0" />
              <span className="min-w-0 flex-1">Card</span>
              <span className="w-20 shrink-0 text-right">Value</span>
              <span
                className="w-14 shrink-0 text-right"
                title="priceChangesCount7d — number of discrete price changes in the last 7 days. Lower = cleaner move; high = thin/churny market."
              >
                Chg 7d
              </span>
              <span className="w-16 shrink-0 text-right">7d %</span>
              <span
                className="w-16 shrink-0 text-right"
                title="priceChange30d — 30-day percent change. A longer-horizon trend read alongside the 7-day move."
              >
                30d %
              </span>
              <span className="w-9 shrink-0" />
            </div>
            <ul className="divide-y divide-black/10 dark:divide-white/10">
              {rows.map((r) => {
                const thumb = tcgplayerImageUrl(r.tcgplayerId, "400x400");
                return (
                  <li
                    key={r.variantId}
                    className="flex items-center gap-4 p-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                  >
                    <span className="w-6 shrink-0 text-right text-sm tabular-nums opacity-40">
                      {r.rank}
                    </span>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={r.name}
                        loading="lazy"
                        className="h-16 w-12 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-black/5 text-[10px] opacity-40 dark:bg-white/10">
                        no img
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {r.name}
                        {r.number ? (
                          <span className="opacity-50"> (#{r.number})</span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm opacity-60">
                        {r.printing} · NM · {r.setName}
                      </p>
                    </div>
                    <span className="w-20 shrink-0 text-right font-semibold tabular-nums">
                      {r.value != null ? `$${r.value.toFixed(2)}` : "—"}
                    </span>
                    <span
                      className="w-14 shrink-0 text-right text-sm tabular-nums opacity-70"
                      title={
                        r.cov7d != null
                          ? `${r.priceChanges7d ?? 0} price change${r.priceChanges7d === 1 ? "" : "s"} in 7d · COV ${(r.cov7d * 100).toFixed(1)}%`
                          : `${r.priceChanges7d ?? 0} price change${r.priceChanges7d === 1 ? "" : "s"} in 7d`
                      }
                    >
                      {r.priceChanges7d ?? "—"}
                    </span>
                    <span className="w-16 shrink-0 text-right">
                      <PctBadge pct={r.pct} />
                    </span>
                    <span className="w-16 shrink-0 text-right">
                      <PctBadge pct={r.pct30d} />
                    </span>
                    <CopyButton text={copyText(r)} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
