"use client";

import { useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * A batching checkbox dropdown. Toggling boxes only mutates a local draft; the
 * change is committed (via onChange) when the popover closes — on outside-click,
 * Escape, or a trigger toggle. Includes Select all / Clear shortcuts.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyLabel = "All",
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Trigger summary shown when nothing is selected. */
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const ref = useRef<HTMLDivElement>(null);

  // Close the panel, committing the draft to the parent only if it changed.
  useEffect(() => {
    if (!open) return;
    const commit = () => {
      setOpen(false);
      const changed =
        draft.length !== selected.length ||
        draft.some((v) => !selected.includes(v));
      if (changed) onChange(draft);
    };
    const onDocMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) commit();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") commit();
    };
    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, draft, selected, onChange]);

  function toggleOpen() {
    if (open) {
      setOpen(false);
      const changed =
        draft.length !== selected.length ||
        draft.some((v) => !selected.includes(v));
      if (changed) onChange(draft);
    } else {
      setDraft(selected); // seed from committed state on each open
      setOpen(true);
    }
  }

  function toggleValue(value: string) {
    setDraft((d) =>
      d.includes(value) ? d.filter((x) => x !== value) : [...d, value],
    );
  }

  const summary = selected.length ? `${selected.length} selected` : emptyLabel;

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <span className="text-xs font-medium opacity-60">{label}</span>
      <button
        type="button"
        onClick={toggleOpen}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex min-w-44 items-center justify-between gap-2 rounded-md border border-black/15 bg-background px-2 py-1.5 text-sm dark:border-white/15"
      >
        <span className="truncate">{summary}</span>
        <span className="opacity-50">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-10 mt-1 max-h-72 w-56 overflow-auto rounded-md border border-black/15 bg-background p-1 shadow-lg dark:border-white/15">
          <div className="flex items-center justify-between gap-2 border-b border-black/10 px-2 py-1.5 text-xs dark:border-white/10">
            <button
              type="button"
              onClick={() => setDraft(options.map((o) => o.value))}
              className="font-medium opacity-70 hover:opacity-100"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setDraft([])}
              className="font-medium opacity-70 hover:opacity-100"
            >
              Clear
            </button>
          </div>
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              <input
                type="checkbox"
                checked={draft.includes(o.value)}
                onChange={() => toggleValue(o.value)}
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
