-- AlterTable
ALTER TABLE "card_variants" ADD COLUMN "avgPrice30d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "avgPrice90d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "covPrice30d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "covPrice90d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "iqrPrice30d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "iqrPrice7d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "iqrPrice90d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "maxPrice1y" REAL;
ALTER TABLE "card_variants" ADD COLUMN "maxPrice30d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "maxPrice90d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "maxPriceAllTime" REAL;
ALTER TABLE "card_variants" ADD COLUMN "maxPriceAllTimeDate" DATETIME;
ALTER TABLE "card_variants" ADD COLUMN "minPrice1y" REAL;
ALTER TABLE "card_variants" ADD COLUMN "minPrice30d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "minPrice90d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "minPriceAllTime" REAL;
ALTER TABLE "card_variants" ADD COLUMN "minPriceAllTimeDate" DATETIME;
ALTER TABLE "card_variants" ADD COLUMN "priceChange30d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "priceChange90d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "priceChangesCount30d" INTEGER;
ALTER TABLE "card_variants" ADD COLUMN "priceChangesCount90d" INTEGER;
ALTER TABLE "card_variants" ADD COLUMN "priceRelativeTo30dRange" REAL;
ALTER TABLE "card_variants" ADD COLUMN "priceRelativeTo90dRange" REAL;
ALTER TABLE "card_variants" ADD COLUMN "stddevPopPrice30d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "stddevPopPrice7d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "stddevPopPrice90d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "trendSlope30d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "trendSlope7d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "trendSlope90d" REAL;

-- CreateIndex
CREATE INDEX "card_variants_priceChange30d_idx" ON "card_variants"("priceChange30d");
