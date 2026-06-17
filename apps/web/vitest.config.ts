import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Pure client-logic unit tests (no DOM): the table view reducers/selectors in
// src/lib. The `@/` alias mirrors tsconfig paths so tests import like the app.
export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
