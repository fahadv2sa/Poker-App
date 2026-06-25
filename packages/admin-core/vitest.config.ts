import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Admin-core's integration tests reuse the same local Postgres as @fb/db.
// Load packages/db/.env (relative to this package), then prefer a dedicated test
// database if provided. Must happen before the Prisma client module is imported.
loadEnv({ path: "../db/.env" });
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
