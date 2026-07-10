"use client";

import { useState } from "react";

/**
 * Downloads a ZIP of the current list's card images. `query` is the same
 * filter query string the page rendered with, so the export matches what's
 * shown exactly.
 */
export function ExportButton({ query }: { query: string }) {
  const [busy, setBusy] = useState(false);

  function onClick() {
    setBusy(true);
    // Navigating to the route triggers the browser download.
    window.location.href = `/api/export/images${query ? `?${query}` : ""}`;
    // The download starts server-side; clear the busy state shortly after.
    setTimeout(() => setBusy(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
    >
      {busy ? "Preparing ZIP…" : "Batch export images"}
    </button>
  );
}
