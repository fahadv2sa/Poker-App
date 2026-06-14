import { defineConfig } from "vitest/config";

// Room-flow tests use in-memory fakes (no DB, no sockets), so they run fully in
// parallel and need no live services.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
