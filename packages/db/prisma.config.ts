// Prisma 7 project configuration (replaces the datasource `url`/`directUrl` and
// the package.json `prisma.seed` block, both removed in v7).
//
// Env is no longer auto-loaded by the CLI in v7, so we load it explicitly here.
import "dotenv/config";

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Seeds only run on explicit `prisma db seed` (v7 no longer auto-seeds).
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // The CLI/Migrate uses the DIRECT (unpooled) connection; runtime queries use
    // the pooled DATABASE_URL via the pg adapter in src/client.ts. On Railway PG
    // both are the same value — the fallback keeps deploys working when only
    // DATABASE_URL is set (mirrors the old railway.toml predeploy fallback).
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
