import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7's default "client" engine has no bundled binary and connects
// through a driver adapter. For a locally-run app we use better-sqlite3
// pointed at the DATABASE_URL from .env (e.g. "file:./dev.db").
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

// Reuse a single PrismaClient across hot-reloads in dev, otherwise every
// reload would open a new connection and eventually exhaust resources.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
