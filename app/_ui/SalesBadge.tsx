// Presentational, stateless (lives in _ui/): the latest-sales cell for a row.

import { liquidityOf, type SalesSummary } from "@/lib/tcgplayer/latest-sales";

export type SalesCellState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; summary: SalesSummary };

/**
 * Leads with the span — "5 / 86d" reads as a rate: five sales took 86 days.
 * That's the useful signal, since TCGplayer caps the window at 5 sales and a
 * raw count would be identical for every liquid card.
 */
function spanLabel(s: SalesSummary): string {
  if (s.count === 0) return "no sales";
  if (s.count === 1) return "1 sale";
  return `${s.count} / ${s.spanDays}d`;
}

function tooltip(s: SalesSummary): string {
  if (s.count === 0) {
    return "TCGplayer reports no recent sales for this printing/condition.";
  }
  const lines = [
    s.capped
      ? `${s.count} sales over ${s.spanDays} days (window is capped at 5, so more sales exist — this is the rate, not the total).`
      : `${s.count} sale${s.count === 1 ? "" : "s"} over ${s.spanDays} days — all TCGplayer surfaces for this printing/condition.`,
    `Last sale ${s.daysSinceLast}d ago.`,
  ];
  if (s.medianPrice !== null) {
    lines.push(`Median paid (incl. shipping): $${s.medianPrice.toFixed(2)}.`);
  }
  return lines.join(" ");
}

export function SalesBadge({ state }: { state: SalesCellState }) {
  if (state.status === "idle") {
    return <span className="text-sm opacity-30">—</span>;
  }

  if (state.status === "loading") {
    return (
      <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40" />
    );
  }

  if (state.status === "error") {
    return (
      <span
        className="text-sm text-amber-700 dark:text-amber-500"
        title={state.message}
      >
        !
      </span>
    );
  }

  const { summary } = state;
  const liquidity = liquidityOf(summary);
  const tone =
    liquidity === "thin"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : liquidity === "none"
        ? "bg-black/10 opacity-60 dark:bg-white/10"
        : "bg-black/[0.06] dark:bg-white/10";

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm tabular-nums ${tone}`}
      title={
        liquidity === "thin"
          ? `Thin market — treat the % move with caution. ${tooltip(summary)}`
          : tooltip(summary)
      }
    >
      {liquidity === "thin" ? <span aria-hidden="true">⚠</span> : null}
      {spanLabel(summary)}
    </span>
  );
}
