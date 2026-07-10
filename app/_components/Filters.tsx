"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { MoverDirection } from "@/lib/trends";

export interface FilterState {
  direction: MoverDirection;
  minPrice: number;
  maxPrice: number;
  series: string; // "" = all
  limit: number;
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

  function push(patch: Partial<Record<keyof FilterState, string>>) {
    const merged: Record<string, string> = {
      direction: current.direction,
      series: current.series,
      minPrice,
      maxPrice,
      limit,
      ...patch,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v !== "" && v != null) params.set(k, v);
    }
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

      {/* Series */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium opacity-60">Series</span>
        <select
          value={current.series}
          onChange={(e) => push({ series: e.target.value })}
          className="min-w-44 rounded-md border border-black/15 bg-background px-2 py-1.5 text-sm dark:border-white/15"
        >
          <option value="">All series</option>
          {seriesList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

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
    </form>
  );
}
