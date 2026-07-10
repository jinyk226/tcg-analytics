// Card images are not provided by JustTCG. We derive them from the card's
// TCGplayer product id via the TCGplayer CDN. The URL pattern isn't guaranteed
// for every product/size, so callers should fall back through IMAGE_SIZES.

const CDN_BASE = "https://tcgplayer-cdn.tcgplayer.com/product";

/** Preferred → fallback CDN render sizes (largest first). */
export const IMAGE_SIZES = ["1000x1000", "400x400", "200x200"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

/** Build a TCGplayer CDN image URL, or null if there's no product id. */
export function tcgplayerImageUrl(
  tcgplayerId: string | null | undefined,
  size: ImageSize = "1000x1000",
): string | null {
  if (!tcgplayerId) return null;
  return `${CDN_BASE}/${tcgplayerId}_in_${size}.jpg`;
}
