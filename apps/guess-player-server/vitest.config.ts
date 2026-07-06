import { defineConfig } from "vitest/config";

// Match-orchestration tests run against fake deps (no DB, no sockets) with
// fake timers, mirroring the top-10-server test harness.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
