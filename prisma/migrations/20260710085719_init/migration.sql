-- CreateTable
CREATE TABLE "games" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "sets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "justTcgId" TEXT,
    "gameId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "releaseDate" DATETIME,
    "cardCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sets_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cards" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "justTcgId" TEXT NOT NULL,
    "gameId" INTEGER NOT NULL,
    "setId" INTEGER,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "rarity" TEXT,
    "tcgplayerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cards_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cards_setId_fkey" FOREIGN KEY ("setId") REFERENCES "sets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "card_variants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "justTcgId" TEXT,
    "cardId" INTEGER NOT NULL,
    "condition" TEXT,
    "printing" TEXT,
    "language" TEXT DEFAULT 'EN',
    "latestPrice" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "card_variants_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "variantId" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "marketPrice" REAL,
    "lowPrice" REAL,
    "highPrice" REAL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_snapshots_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "card_variants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "games_key_key" ON "games"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sets_justTcgId_key" ON "sets"("justTcgId");

-- CreateIndex
CREATE INDEX "sets_gameId_idx" ON "sets"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "sets_gameId_code_key" ON "sets"("gameId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cards_justTcgId_key" ON "cards"("justTcgId");

-- CreateIndex
CREATE INDEX "cards_gameId_idx" ON "cards"("gameId");

-- CreateIndex
CREATE INDEX "cards_setId_idx" ON "cards"("setId");

-- CreateIndex
CREATE INDEX "cards_name_idx" ON "cards"("name");

-- CreateIndex
CREATE UNIQUE INDEX "card_variants_justTcgId_key" ON "card_variants"("justTcgId");

-- CreateIndex
CREATE INDEX "card_variants_cardId_idx" ON "card_variants"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "card_variants_cardId_printing_condition_language_key" ON "card_variants"("cardId", "printing", "condition", "language");

-- CreateIndex
CREATE INDEX "price_snapshots_variantId_recordedAt_idx" ON "price_snapshots"("variantId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "price_snapshots_variantId_recordedAt_key" ON "price_snapshots"("variantId", "recordedAt");
