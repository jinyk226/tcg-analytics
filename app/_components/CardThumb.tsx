"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { tcgplayerImageUrl } from "@/lib/images";

const ZOOM_W = 320; // px; the floating preview's width (aspect keeps height)
const GAP = 12; // px gap between the thumbnail and the floating preview

/**
 * A card thumbnail that reveals a larger, full-resolution image in a floating
 * div on hover. The preview is `position: fixed` so it escapes the table's
 * `overflow-hidden` clip, and is anchored beside the thumbnail (flipping to the
 * left edge when there isn't room on the right), clamped to the viewport.
 */
export function CardThumb({
  tcgplayerId,
  alt,
}: {
  tcgplayerId: string | null | undefined;
  alt: string;
}) {
  const thumb = tcgplayerImageUrl(tcgplayerId, "400x400");
  const full = tcgplayerImageUrl(tcgplayerId, "1000x1000");
  const anchorRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!hovered || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const height = ZOOM_W; // TCGplayer renders are square-ish; height ≈ width
    // Prefer the right side; flip left if it would overflow the viewport.
    const rightLeft = rect.right + GAP;
    const left =
      rightLeft + ZOOM_W <= window.innerWidth
        ? rightLeft
        : Math.max(GAP, rect.left - GAP - ZOOM_W);
    // Vertically center on the thumbnail, clamped to the viewport.
    const top = Math.min(
      Math.max(GAP, rect.top + rect.height / 2 - height / 2),
      window.innerHeight - height - GAP,
    );
    setPos({ left, top });
  }, [hovered]);

  if (!thumb) {
    return (
      <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-black/5 text-[10px] opacity-40 dark:bg-white/10">
        no img
      </div>
    );
  }

  return (
    <div
      ref={anchorRef}
      className="shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPos(null);
      }}
    >
      <img
        src={thumb}
        alt={alt}
        loading="lazy"
        className="h-16 w-12 rounded object-cover"
      />
      {hovered && pos && (
        <div
          className="pointer-events-none fixed z-50 overflow-hidden rounded-lg border border-black/10 bg-white shadow-2xl dark:border-white/15 dark:bg-neutral-900"
          style={{ left: pos.left, top: pos.top, width: ZOOM_W }}
        >
          <img
            src={full ?? thumb}
            alt={alt}
            className="block w-full"
          />
        </div>
      )}
    </div>
  );
}
