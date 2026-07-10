-- AlterTable
ALTER TABLE "card_variants" ADD COLUMN "apiLastUpdated" DATETIME;
ALTER TABLE "card_variants" ADD COLUMN "avgPrice" REAL;
ALTER TABLE "card_variants" ADD COLUMN "maxPrice7d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "minPrice7d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "priceChange24hr" REAL;
ALTER TABLE "card_variants" ADD COLUMN "priceChange7d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "startPrice7d" REAL;

-- AlterTable
ALTER TABLE "sets" ADD COLUMN "lastSyncedAt" DATETIME;
ALTER TABLE "sets" ADD COLUMN "series" TEXT;
ALTER TABLE "sets" ADD COLUMN "setValueChange7dPct" REAL;
ALTER TABLE "sets" ADD COLUMN "setValueUsd" REAL;

-- CreateIndex
CREATE INDEX "card_variants_priceChange7d_idx" ON "card_variants"("priceChange7d");

-- CreateIndex
CREATE INDEX "card_variants_latestPrice_idx" ON "card_variants"("latestPrice");

-- CreateIndex
CREATE INDEX "card_variants_startPrice7d_idx" ON "card_variants"("startPrice7d");

-- CreateIndex
CREATE INDEX "sets_series_idx" ON "sets"("series");
