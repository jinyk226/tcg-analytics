"use client";

import { useSales } from "@/app/_components/SalesProvider";
import { SalesBadge } from "@/app/_ui/SalesBadge";

/** Subscribes one row to the shared sweep state. */
export function SalesCell({ variantId }: { variantId: number }) {
  const { stateFor } = useSales();
  return <SalesBadge state={stateFor(variantId)} />;
}
