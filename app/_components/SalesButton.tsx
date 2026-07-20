"use client";

import { useSales } from "@/app/_components/SalesProvider";

/** Triggers the latest-sales sweep over the rows currently on screen. */
export function SalesButton() {
  const { run, running, done, total } = useSales();

  return (
    <button
      type="button"
      onClick={run}
      disabled={running || total === 0}
      title="Look up recent TCGplayer sales for the rows on screen (one request per card)"
      className="inline-flex items-center justify-center rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
    >
      {running ? `Fetching sales… ${done}/${total}` : "Fetch sales data"}
    </button>
  );
}
