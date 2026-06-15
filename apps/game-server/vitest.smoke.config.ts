import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Opt-in end-to-end smoke test. It stands up the real stack (web + game-server +
// Postgres) and drives one full hand. Kept OUT of the default unit suite
// (tests/**) — run with: RUN_SMOKE=1 vitest run -c vitest.smoke.config.ts

// Load DATABASE_URL into the environment BEFORE the test imports @fp/db, so the
// Prisma client (constructed at import) binds the right datasource.
const dbEnvPath = resolve(process.cwd(), "..", "..", "packages", "db", ".env");
const dbLine = readFileSync(dbEnvPath, "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="));
if (dbLine) {
  process.env.DATABASE_URL = dbLine.replace(/^DATABASE_URL=/, "").replace(/^"|"$/g, "").trim();
}
process.env.AUTH_SECRET ??= "smoke-e2e-secret-do-not-use-in-prod-000000=";

export default defineConfig({
  test: {
    include: ["smoke/**/*.test.ts"],
    hookTimeout: 300_000,
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
