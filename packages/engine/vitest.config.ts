import { defineConfig } from "vitest/config";

// The engine is pure (no I/O, no DB), so tests run fully in parallel.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
