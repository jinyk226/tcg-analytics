"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { MoverDirection } from "@/lib/trends";
import { EXCLUDE_CATEGORIES } from "@/lib/exclude-categories";
import { MultiSelect } from "@/app/_components/MultiSelect";

export interface FilterState {
  direction: MoverDirection;
  minPrice: number;
  maxPrice: number;
  series: string[]; // [] = all
  exclude: string[]; // exclude-category ids; [] = exclude nothing
  limit: number;
  maxPriceChanges: number; // churn cap; 0 = off
  maxCov: number; // dispersion cap; 0 = off
}

export function Filters({
  seriesList,
  current,
}: {
  seriesList: string[];
  current: FilterState;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [minPrice, setMinPrice] = useState(String(current.minPrice));
  const [maxPrice, setMaxPrice] = useState(String(current.maxPrice));
  const [limit, setLimit] = useState(String(current.limit));
  const [maxChanges, setMaxChanges] = useState(String(current.maxPriceChanges));
  const [maxCov, setMaxCov] = useState(
    current.maxCov ? String(current.maxCov) : "",
  );

  function push(
    patch: {
      direction?: MoverDirection;
      series?: string[];
      exclude?: string[];
    } = {},
  ) {
    const nextDirection = patch.direction ?? current.direction;
    const nextSeries = patch.series ?? current.series;
    const nextExclude = patch.exclude ?? current.exclude;

    const params = new URLSearchParams();
    params.set("direction", nextDirection);
    // Scalar numeric inputs (from local state; skip blanks).
    for (const [k, v] of Object.entries({
      minPrice,
      maxPrice,
      limit,
      maxPriceChanges: maxChanges,
      maxCov,
    })) {
      if (v !== "" && v != null) params.set(k, v);
    }
    for (const s of nextSeries) params.append("series", s);
    // Always emit exclude so the default-on state stays explicit after any
    // interaction; `none` marks an explicit empty selection.
    if (nextExclude.length) {
      for (const id of nextExclude) params.append("exclude", id);
    } else {
      params.append("exclude", "none");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  // "Show all" — a true see-everything view: all series, nothing excluded, no
  // price limits. Preserves the current Direction and Top N.
  function showAll() {
    const params = new URLSearchParams();
    params.set("direction", current.direction);
    params.set("limit", String(current.limit));
    params.set("minPrice", "0");
    params.set("maxPrice", "1000000");
    params.set("exclude", "none");
    router.push(`${pathname}?${params.toString()}`);
  }

  const toggleBase =
    "px-3 py-1.5 text-sm font-semibold transition first:rounded-l-md last:rounded-r-md";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        push({});
      }}
      className="flex flex-wrap items-end gap-4 rounded-xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]"
    >
      {/* Direction toggle */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium opacity-60">Direction</span>
        <div className="inline-flex overflow-hidden rounded-md border border-black/15 dark:border-white/15">
          {(["gainers", "losers"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => push({ direction: d })}
              className={`${toggleBase} ${
                current.direction === d
                  ? "bg-foreground text-background"
                  : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {d === "gainers" ? "Gainers" : "Losers"}
            </button>
          ))}
        </div>
      </div>

      {/* Series (multi-select) */}
      <MultiSelect
        label="Series"
        emptyLabel="All series"
        options={seriesList.map((s) => ({ value: s, label: s }))}
        selected={current.series}
        onChange={(next) => push({ series: next })}
      />

      {/* Exclude categories (multi-select) */}
      <MultiSelect
        label="Exclude"
        emptyLabel="None"
        options={EXCLUDE_CATEGORIES.map((c) => ({
          value: c.id,
          label: c.label,
        }))}
        selected={current.exclude}
        onChange={(next) => push({ exclude: next })}
      />

      {/* Price band */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium opacity-60">Price band ($)</span>
        <div className="flex items-center gap-1.5">
          <input
            inputMode="decimal"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-20 rounded-md border border-black/15 bg-background px-2 py-1.5 text-sm dark:border-white/15"
            aria-label="Minimum price"
          />
          <span className="opacity-50">–</span>
          <input
            inputMode="decimal"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-20 rounded-md border border-black/15 bg-background px-2 py-1.5 text-sm dark:border-white/15"
            aria-label="Maximum price"
          />
        </div>
      </div>

      {/* Quality guards */}
      <label className="flex flex-col gap-1">
        <span
          className="text-xs font-medium opacity-60"
          title="Drop cards whose price changed more than this many times in 7 days (thin/churny markets). 0 = off."
        >
          Max chg (7d)
        </span>
        <input
          inputMode="numeric"
          value={maxChanges}
          onChange={(e) => setMaxChanges(e.target.value)}
          className="w-20 rounded-md border border-black/15 bg-background px-2 py-1.5 text-sm dark:border-white/15"
          aria-label="Maximum 7-day price changes (0 = off)"
          placeholder="off"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span
          className="text-xs font-medium opacity-60"
          title="Drop cards whose 7d coefficient of variation exceeds this. Optional — COV grows with move size, so leave blank unless you want only ultra-stable holds."
        >
          Max COV
        </span>
        <input
          inputMode="decimal"
          value={maxCov}
          onChange={(e) => setMaxCov(e.target.value)}
          className="w-20 rounded-md border border-black/15 bg-background px-2 py-1.5 text-sm dark:border-white/15"
          aria-label="Maximum 7-day coefficient of variation (blank = off)"
          placeholder="off"
        />
      </label>

      {/* Limit */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium opacity-60">Top N</span>
        <input
          inputMode="numeric"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          className="w-20 rounded-md border border-black/15 bg-background px-2 py-1.5 text-sm dark:border-white/15"
          aria-label="Number of rows"
        />
      </label>

      <button
        type="submit"
        className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-semibold transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        Apply
      </button>

      <button
        type="button"
        onClick={showAll}
        className="rounded-md px-3 py-1.5 text-sm font-medium underline decoration-black/20 underline-offset-4 opacity-70 transition hover:opacity-100 dark:decoration-white/20"
      >
        Show all
      </button>
    </form>
  );
}
