# Market Volatility & the Quality Filter

A JustTCG "7-day gainer" is not automatically a *good* clip for a video. A card
whose price ping-pongs between $5 and $15 all week can post a huge `priceChange7d`
that's really just thin-market noise — and it may reverse before the video is up.
This doc investigates how to separate **clean, believable moves** from **churn**,
using the two volatility metrics JustTCG exposes per variant, and documents the
filter we built on top of that analysis.

TL;DR: **`priceChangesCount7d` is the primary quality knob; raw `covPrice7d` is a
trap.** We default to dropping cards that changed price more than **5 times** in
the window, which removes ~half of raw "big movers" — the churny half.

---

## 1. The two metrics

Every JustTCG variant carries a full 7-day statistics bundle. Two of them measure
volatility:

| Field | Meaning | Intuition |
| ----- | ------- | --------- |
| **`priceChangesCount7d`** | Number of *discrete price changes* during the 7-day window. | `0` = flat · `1` = one clean step · high = the price is being re-marked constantly (thin, churny market). |
| **`covPrice7d`** | **Coefficient of variation** = stddev ÷ mean over the window. A unitless dispersion measure (a $2 and a $200 card are comparable). | `0` = every reading identical · higher = the prices in the window were more spread out. |

We ingest both onto `CardVariant` (`lib/justtcg/ingest.ts`); the API also exposes
`stddevPopPrice7d`, `iqrPrice7d`, and `trendSlope7d`, which we don't store yet but
reference below.

---

## 2. What the data actually looks like

Measured over the full local catalog — **19,645** Near-Mint English variants whose
price sits in (or entered) the $0.50–$20 band, of which **543** are "big movers"
(`|priceChange7d| ≥ 20%`):

| Metric | All in-band | Big movers |
| ------ | ----------- | ---------- |
| `priceChangesCount7d` median | 1 | **6** |
| `priceChangesCount7d` p90 | 12 | 20 |
| `covPrice7d` median | 0.007 (0.7%) | **0.105 (10.5%)** |
| `covPrice7d` p90 | 0.040 | 0.266 |
| `covPrice7d` max | 1.06 | 1.06 |

Big-mover `priceChangesCount7d` buckets:

| Changes in 7d | Share of big movers | Read |
| ------------- | ------------------- | ---- |
| 0–1 (clean single step) | 22% | ✅ highest quality |
| 2–3 | 17% | ✅ coherent |
| 4–5 | 10% | ⚠️ getting busy |
| **6+ (churn)** | **50%** | ❌ thin / thrashy |

**Half of all raw "big movers" change price 6+ times a week.** That's the noise the
filter is meant to remove.

---

## 3. The key insight: why raw COV is the wrong knob

The tempting move is "reject cards with high `covPrice7d`." **Don't.** COV rises
*mechanically* with the size of a genuine move, so a high COV is often a sign of a
big *clean* move, not noise. Concrete cases from the catalog:

| Card | `priceChange7d` | `priceChangesCount7d` | `covPrice7d` | Verdict |
| ---- | --------------- | --------------------- | ------------ | ------- |
| Shellos East Sea | **+582%** | **1** | **1.06** (highest in DB) | ✅ one clean step off a low base |
| Prof. Oak's Visit | +376% | 1 | 0.35 | ✅ clean |
| Telepathic Psychic Energy | +253% | **13** | 0.45 | ❌ churn |
| Gengar 050/088 | +1680% | **17** | 0.42 | ❌ churn |

Shellos has the **highest COV in the entire database** yet is a textbook clean
gainer (a single re-rating). A `cov ≤ 0.25` cap would delete it while *keeping*
plenty of 8-change thrashers whose COV happens to land lower. So:

- **`priceChangesCount7d` cleanly separates the two** — clean moves changed price
  once or twice; the junk changed it 6–17 times.
- **`covPrice7d` only makes sense *relative to the move*.** The meaningful quantity
  is the **noise ratio** `covPrice7d ÷ (|priceChange7d| ÷ 100)` — dispersion per
  unit of net progress. For genuine movers it stays bounded (≲ 0.55); for
  pure-wiggle cards (lots of spread, little net change) it explodes past 1. In
  other words: high COV is fine *if it bought you a big net move*.

Note that **both** metrics, used alone, conflate a healthy **steady climb** (many
small up-days → high count, high dispersion) with unhealthy **whipsaw**. The true
disambiguator is *directionality* (`trendSlope7d`, or the noise ratio above). We
keep the shipped filter simple — a count cap catches the great majority of junk in
practice — and leave slope/noise-ratio as documented future levers.

---

## 4. What we shipped

`getMovers()` (`lib/trends.ts`) takes two optional guards, both applied in SQL and
**null-tolerant** (a variant with no volatility data passes rather than vanishing):

| Filter | Field | Default | Effect |
| ------ | ----- | ------- | ------ |
| `maxPriceChanges` | `priceChangesCount7d ≤ n` | **5** | Drops thin/churny markets. At 5, keeps ~50% of big movers (the clean half). |
| `maxCov` | `covPrice7d ≤ n` | off | Optional "only ultra-stable holds" cap. Off by default because it penalizes large clean moves (see §3). |

Both are exposed in the filter bar (**Max chg (7d)** / **Max COV**), flow into the
URL so the Server Component re-queries, and are forwarded to the image-export route
so the downloaded ZIP matches exactly what's on screen.

`priceChangesCount7d` is also shown as its own **Chg 7d** column in the list (with
`covPrice7d` in the cell's hover tooltip). It is deliberately **excluded** from the
per-row Copy text and from export filenames — it's a *screening* aid, not caption
content.

---

## 5. Recommended recipes

| Goal | Settings |
| ---- | -------- |
| **Daily video default** — clean, believable movers | Max chg = **5** (the default), Max COV = off |
| **Only pristine single-step moves** | Max chg = **2**, Max COV = off |
| **Ultra-conservative / blue-chip holds** | Max chg = **3**, Max COV = **0.20** |
| **See everything raw (research)** | Max chg = **0** (off), Max COV = off |

Start at the default. If a list feels too sparse (e.g. a quiet series), raise the
change cap toward 8–10 before you reach for COV. If a specific card looks too good
to be true, check its **Chg 7d** count and the tooltip COV before featuring it.

---

## 6. Future levers (not built)

- **`trendSlope7d`** — would let a steady multi-day climb (high count, but
  monotonic) survive a tight change cap, separating "climb" from "whipsaw."
- **Stored noise ratio** — persist `covPrice7d ÷ (|priceChange7d|/100)` as a column
  and filter on it directly, the most principled single dispersion guard.
- **Snapshot-derived volatility** — once our own `PriceSnapshot` history is ≥ 7
  days deep, compute these stats locally instead of trusting the API's window.
