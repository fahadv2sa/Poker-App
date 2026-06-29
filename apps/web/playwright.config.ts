import { defineConfig } from "@playwright/test";

/**
 * Visual + mobile-sizing regression for the Top Ten table, now served by THIS web service
 * at /games/top-10. Loads the preview across the phone-size matrix and asserts no
 * scroll/overflow + captures screenshots. Assumes the dev server is running on :3000
 * (pnpm --filter @fb/web dev). Run: `pnpm --filter @fb/web test:visual` (one-time
 * `npx playwright install chromium`; see docs/top-10/DEV_NOTES.md for the TLS/proxy notes).
 */
export default defineConfig({
  testDir: "./e2e",
  // Serial: parallel chromium workers contend on the single dev server (cold-compile
  // timeouts) and produce false overflow failures; 5 quick checks run fine in sequence.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TT_BASE_URL ?? "http://127.0.0.1:3000",
    launchOptions: { args: ["--no-proxy-server"] },
  },
});
