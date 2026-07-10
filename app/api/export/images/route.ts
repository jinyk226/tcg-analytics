import JSZip from "jszip";
import { IMAGE_SIZES, tcgplayerImageUrl } from "@/lib/images";
import {
  DEFAULT_LIMIT,
  DEFAULT_MAX_PRICE,
  DEFAULT_MIN_PRICE,
  getMovers,
  type MoverDirection,
  type MoverRow,
} from "@/lib/trends";

const FETCH_CONCURRENCY = 6;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "card";
}

/** Fetch a card image, trying each CDN size in turn; null if none resolve. */
async function fetchImage(tcgplayerId: string): Promise<Uint8Array | null> {
  for (const size of IMAGE_SIZES) {
    const url = tcgplayerImageUrl(tcgplayerId, size);
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) {
        return new Uint8Array(await res.arrayBuffer());
      }
    } catch {
      // try the next size
    }
  }
  return null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const direction: MoverDirection = params.get("direction") === "losers" ? "losers" : "gainers";
  const minPrice = Number(params.get("minPrice")) || DEFAULT_MIN_PRICE;
  const maxPrice = Number(params.get("maxPrice")) || DEFAULT_MAX_PRICE;
  const series = params.get("series") || undefined;
  const limit = Math.max(1, Math.min(200, Number(params.get("limit")) || DEFAULT_LIMIT));

  const rows = await getMovers({ direction, minPrice, maxPrice, series, limit });

  // Dedupe by tcgplayerId (a card can have multiple variant rows), keeping the
  // best-ranked occurrence; drop rows without a product id.
  const seen = new Set<string>();
  const targets = rows.filter((r: MoverRow) => {
    if (!r.tcgplayerId || seen.has(r.tcgplayerId)) return false;
    seen.add(r.tcgplayerId);
    return true;
  });

  const zip = new JSZip();
  const width = String(rows.length).length;

  // Bounded-concurrency fetch; filenames use rank so order is independent of timing.
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const r = targets[cursor++];
      const bytes = await fetchImage(r.tcgplayerId!);
      if (!bytes) continue;
      const num = (r.number ?? "").replace(/[^a-z0-9]+/gi, "-");
      const name = `${String(r.rank).padStart(width, "0")}_${slugify(r.name)}${num ? `_${num}` : ""}.jpg`;
      zip.file(name, bytes);
    }
  }
  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));

  const body = await zip.generateAsync({ type: "arraybuffer" });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="pokemon-${direction}-${date}.zip"`,
    },
  });
}
