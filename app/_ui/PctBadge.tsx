// Presentational, stateless (lives in _ui/): a colored 7-day % change pill.

export function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="rounded-full bg-black/10 px-2 py-0.5 text-sm dark:bg-white/10">—</span>;
  }
  const up = pct > 0;
  const down = pct < 0;
  const tone = up
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : down
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
      : "bg-black/10 dark:bg-white/10";
  const label = `${up ? "+" : ""}${pct.toFixed(1)}%`;
  return (
    <span className={`rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ${tone}`}>
      {label}
    </span>
  );
}
