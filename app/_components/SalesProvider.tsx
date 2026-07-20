"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { SalesCellState } from "@/app/_ui/SalesBadge";
import type { SalesSummary } from "@/lib/tcgplayer/latest-sales";

/** One row's lookup key and the query that identifies it upstream. */
export interface SalesTarget {
  variantId: number;
  productId: string;
  condition: string | null;
  printing: string | null;
}

interface SalesContextValue {
  stateFor: (variantId: number) => SalesCellState;
  run: () => void;
  running: boolean;
  done: number;
  total: number;
}

const SalesContext = createContext<SalesContextValue | null>(null);

/** Parallel lookups in flight. The endpoint is undocumented — stay polite. */
const CONCURRENCY = 4;

export function SalesProvider({
  targets,
  children,
}: {
  targets: SalesTarget[];
  children: React.ReactNode;
}) {
  const [states, setStates] = useState<Record<number, SalesCellState>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);

  const run = useCallback(async () => {
    if (running || targets.length === 0) return;
    setRunning(true);
    setDone(0);
    setStates(
      Object.fromEntries(
        targets.map((t) => [
          t.variantId,
          { status: "loading" } as SalesCellState,
        ]),
      ),
    );

    // Bounded-concurrency fan-out; each row commits its own result so the table
    // fills in progressively and one failure doesn't sink the sweep.
    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        const t = targets[cursor++];
        let next: SalesCellState;
        try {
          const params = new URLSearchParams({ productId: t.productId });
          if (t.condition) params.set("condition", t.condition);
          if (t.printing) params.set("printing", t.printing);
          const res = await fetch(`/api/sales?${params}`);
          const body = await res.json();
          next = res.ok
            ? { status: "done", summary: body as SalesSummary }
            : { status: "error", message: body.error ?? `HTTP ${res.status}` };
        } catch (err) {
          next = {
            status: "error",
            message: err instanceof Error ? err.message : "request failed",
          };
        }
        setStates((prev) => ({ ...prev, [t.variantId]: next }));
        setDone((n) => n + 1);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
  }, [running, targets]);

  const value = useMemo<SalesContextValue>(
    () => ({
      stateFor: (variantId) => states[variantId] ?? { status: "idle" },
      run,
      running,
      done,
      total: targets.length,
    }),
    [states, run, running, done, targets.length],
  );

  return (
    <SalesContext.Provider value={value}>{children}</SalesContext.Provider>
  );
}

export function useSales(): SalesContextValue {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error("useSales must be used within a SalesProvider");
  return ctx;
}
