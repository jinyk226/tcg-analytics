"use client";

import { useState } from "react";

/** Copies a pre-built text block to the clipboard with brief "Copied" feedback. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); fail quietly.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Copy name, set, value, and % change"
      className="rounded-md border border-black/15 px-2.5 py-1 text-sm font-medium transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
