import { getLatestSales } from "@/lib/tcgplayer/latest-sales";

/**
 * Latest-sales lookup for a single product, proxied server-side because the
 * upstream endpoint requires an `Origin`/`Referer` the browser refuses to set
 * and returns no CORS headers.
 *
 *   GET /api/sales?productId=83909&condition=Near+Mint&printing=Reverse+Holofoil
 *
 * One product per request: the client fans out over the visible rows with its
 * own small concurrency pool, so a slow sweep fills in progressively and a
 * single failure doesn't sink the batch.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const productId = params.get("productId");

  if (!productId || !/^\d+$/.test(productId)) {
    return Response.json(
      { error: "productId is required and must be numeric" },
      { status: 400 },
    );
  }

  try {
    const summary = await getLatestSales(productId, {
      condition: params.get("condition"),
      printing: params.get("printing"),
    });
    return Response.json(summary);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "lookup failed" },
      { status: 502 },
    );
  }
}
