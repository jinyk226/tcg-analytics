-- AlterTable
ALTER TABLE "card_variants" ADD COLUMN "covPrice7d" REAL;
ALTER TABLE "card_variants" ADD COLUMN "priceChangesCount7d" INTEGER;

-- CreateIndex
CREATE INDEX "card_variants_priceChangesCount7d_idx" ON "card_variants"("priceChangesCount7d");
