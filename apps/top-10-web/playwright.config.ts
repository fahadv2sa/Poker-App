import { defineConfig } from "@playwright/test";

/**
 * Visual + mobile-sizing regression harness for the Top Ten table. Loads /preview/table
 * across the phone-size matrix and asserts the layout never scrolls/overflows + captures
 * screenshots. Assumes the dev server is already running on :3100 (pnpm dev), so it works
 * with the existing local setup. Run: `pnpm test:visual` (needs `npx playwright install
 * chromium` once — see DEV_NOTES.md if the browser download is blocked by TLS).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TT_BASE_URL ?? "http://127.0.0.1:3100",
    // bypass any system/corporate proxy for the local dev server
    launchOptions: { args: ["--no-proxy-server"] },
  },
});
