import { Filters, type FilterState } from "@/app/_components/Filters";
import { CopyButton } from "@/app/_components/CopyButton";
import { ExportButton } from "@/app/_components/ExportButton";
import { PctBadge } from "@/app/_ui/PctBadge";
import { tcgplayerImageUrl } from "@/lib/images";
import {
  DEFAULT_LIMIT,
  DEFAULT_MAX_PRICE,
  DEFAULT_MIN_PRICE,
  getDataFreshness,
  getMovers,
  getSeriesList,
  type MoverDirection,
  type MoverRow,
} from "@/lib/trends";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function num(value: string | string[] | undefined, fallback: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** The exact 4-line clipboard block for a row. */
function copyText(r: MoverRow): string {
  const head = r.number ? `${r.name} (#${r.number})` : r.name;
  const variant = [r.printing, "NM"].filter(Boolean).join(", ");
  const value = r.value != null ? `$${r.value.toFixed(2)}` : "$—";
  const pct = r.pct != null ? `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(1)}% (7d)` : "";
  return [`${head} — ${variant}`, r.setName ?? "", value, pct].filter(Boolean).join("\n");
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const filters: FilterState = {
    direction: (str(sp.direction) === "losers" ? "losers" : "gainers") as MoverDirection,
    minPrice: num(sp.minPrice, DEFAULT_MIN_PRICE),
    maxPrice: num(sp.maxPrice, DEFAULT_MAX_PRICE),
    series: str(sp.series),
    limit: Math.max(1, Math.min(200, num(sp.limit, DEFAULT_LIMIT))),
  };

  const [rows, seriesList, freshness] = await Promise.all([
    getMovers({
      direction: filters.direction,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      series: filters.series || undefined,
      limit: filters.limit,
    }),
    getSeriesList(),
    getDataFreshness(),
  ]);

  // Query string mirroring the current filters, for the export download.
  const exportQuery = new URLSearchParams({
    direction: filters.direction,
    minPrice: String(filters.minPrice),
    maxPrice: String(filters.maxPrice),
    limit: String(filters.limit),
    ...(filters.series ? { series: filters.series } : {}),
  }).toString();

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pokémon 7-Day Movers</h1>
          <p className="mt-1 text-sm opacity-60">
            {freshness
              ? `Data as of ${freshness.toLocaleString()}`
              : "No data yet — run `npm run ingest`."}
          </p>
        </div>
        <ExportButton query={exportQuery} />
      </header>

      <Filters seriesList={seriesList} current={filters} />

      <div className="mt-6 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm opacity-60">
            No {filters.direction} in ${filters.minPrice}–${filters.maxPrice}
            {filters.series ? ` for ${filters.series}` : ""}. Try widening the band or
            running an ingest.
          </p>
        ) : (
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
                      {r.number ? <span className="opacity-50"> (#{r.number})</span> : null}
                    </p>
                    <p className="truncate text-sm opacity-60">
                      {r.printing} · NM · {r.setName}
                    </p>
                  </div>
                  <span className="shrink-0 text-right font-semibold tabular-nums">
                    {r.value != null ? `$${r.value.toFixed(2)}` : "—"}
                  </span>
                  <span className="w-20 shrink-0 text-right">
                    <PctBadge pct={r.pct} />
                  </span>
                  <CopyButton text={copyText(r)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
