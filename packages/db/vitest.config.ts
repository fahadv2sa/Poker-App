import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Load packages/db/.env, then prefer a dedicated test database if provided.
// This must happen before the Prisma client module is imported by the tests.
loadEnv();
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Wallet concurrency tests share one Postgres row — run files serially.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
