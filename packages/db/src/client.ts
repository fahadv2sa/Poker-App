import { PrismaClient } from "./generated/client";

/**
 * Singleton PrismaClient. In dev (Next.js / tsx watch) modules are re-evaluated
 * on hot reload, so we cache the instance on globalThis to avoid exhausting the
 * connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
