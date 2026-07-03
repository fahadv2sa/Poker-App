import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client";

/**
 * Singleton PrismaClient. In dev (Next.js / tsx watch) modules are re-evaluated
 * on hot reload, so we cache the instance on globalThis to avoid exhausting the
 * connection pool.
 *
 * Prisma 7 requires a driver adapter: the pg adapter opens the pool itself, so
 * runtime queries use the pooled DATABASE_URL (Migrate uses the direct URL from
 * prisma.config.ts). The adapter is likewise cached across hot reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
