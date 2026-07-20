# TCGplayer Latest Sales (liquidity signal)

Adds a **Sales** column to the movers table: recent real sale activity for each row's exact
printing/condition, used to flag thin markets where a big 7-day % move is likely an artifact of
one or two listings rather than demand.

Complements [`volatility-quality-filter.md`](./volatility-quality-filter.md) — that one measures
*price churn* from JustTCG; this one measures *transaction rate* from TCGplayer.

## Source

Unofficial endpoint behind the "Latest Sales" panel on a product page:

```
POST https://mpapi.tcgplayer.com/v2/product/{productId}/latestsales
```

Field names and behavior can change without notice. It 403s without real browser headers
(`Origin`/`Referer` = `https://www.tcgplayer.com`, plus a normal `User-Agent`).

## Gotchas

Verified against the live endpoint on 2026-07-20:

1. **The window is hard-capped at 5 sales.** `limit` is ignored above 5, `offset` is ignored
   entirely (`offset=10` returns the same newest-5 rows), and `nextPage` is always `""`. There is
   no pagination, and `totalResults` reports the cap rather than a real total.

   Consequence: **"number of sales in the last N days" is not obtainable.** Any code that
   paginates this endpoint is fetching one page and stopping. The honest read is the inverse —
   "5 sales spanning N days", i.e. a rate.

2. **The cap is applied *after* server-side filtering.** Narrowing to one condition/printing
   spends the 5 slots on rows you care about and reaches much further back:

   | Query (Blaziken, 83909) | Sales | Span |
   | --- | --- | --- |
   | Unfiltered | 5 | 5.1 days |
   | Near Mint + Holofoil | 5 | 86.3 days |

   So we always filter server-side — which also means exactly **one request per card**, no
   pagination.

3. **Filter ids are numeric.** String names (`"Near Mint"`) are rejected with a 400. The maps in
   `lib/tcgplayer/latest-sales.ts` were derived by scanning ids against products with known
   printings and cover every `condition`/`printing` value in our DB. Conditions are 1–5
   (Near Mint = 1); printings are `Normal`=10, `Holofoil`=11, `Reverse Holofoil`=77,
   `1st Edition`=78, `1st Edition Holofoil`=79, `Unlimited`=122, `Unlimited Holofoil`=123.
   An unrecognized name degrades to an unfiltered (wider, less useful) window rather than throwing.

4. **The browser cannot call this directly.** `Origin`/`Referer` are forbidden headers that JS
   can't set, and the response carries no CORS headers — hence the server-side proxy at
   `app/api/sales/route.ts`.

## Shape

- `lib/tcgplayer/latest-sales.ts` — fetch + summarize + `liquidityOf`, with a 30-minute
  in-memory TTL cache (per-process; cleared on dev restart).
- `app/api/sales/route.ts` — `GET /api/sales?productId=&condition=&printing=`, one product per
  request.
- `app/_components/SalesProvider.tsx` — client-side fan-out over the visible rows, concurrency 4,
  each row committing its own result so the table fills in progressively.
- `app/_ui/SalesBadge.tsx` — stateless badge, leads with the span (`5 / 104d`).

## Thin-market rule

`liquidityOf()` returns `none` / `thin` / `healthy`. Thin when any of:

- fewer than 3 sales in the window,
- nothing sold in the last 14 days, or
- fewer than ~0.1 sales/day (roughly one per 10 days).

The rate check applies whether or not the window is capped — an uncapped window can still be
sparse (3 sales over 84 days is thin by any read), and a capped one is a rate sample by
construction.

⚠️ **These thresholds are initial guesses**, tuned by eye against one screen of gainers, not
validated against outcomes. They're named constants at the top of the module; revisit once
there's a few days of observed data.
