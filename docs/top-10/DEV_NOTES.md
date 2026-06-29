# Top Ten — local dev notes (friction + tooling)

## Local-dev friction (Windows + OneDrive) — known, with mitigations
The repo lives under OneDrive on Windows, which causes two recurring snags. Neither
affects production builds; both are local-only.

1. **Prisma engine EPERM on `prisma generate`** — OneDrive holds
   `query_engine-windows.dll.node`, so the rename fails. The JS client/types still
   regenerate correctly (the binary is identical), so it's harmless. If it blocks you:
   close running dev servers (they hold the DLL), or pause OneDrive sync for the folder.

2. **`.next` cache corruption** — the #1 cause of a "page renders unstyled / 500" scare.
   It happens when **`next build` runs while `next dev` is live** (they share `.next`), or
   when OneDrive locks `.next` files. Rules:
   - **Never run `next build` while the dev server is running.** Stop dev first.
   - Always start dev with the TLS flag so Google Fonts load:
     `NODE_OPTIONS=--use-system-ca pnpm --filter @fb/top-10-web dev` (and same for `@fb/web`).
   - If a page renders unstyled or 500s: kill node, delete `.next`, restart dev:
     ```bash
     # PowerShell
     Get-Process node | Stop-Process -Force
     Remove-Item -Recurse -Force apps\top-10-web\.next   # apps\web\.next may be OneDrive-locked; retry
     ```
   - **Verify a render by actually loading the page + its CSS asset** (`/_next/static/css/
     app/layout.css` must be 200 and non-empty), not by HTTP status alone.

A future hard fix is to move the repo out of OneDrive (or exclude `node_modules` + `.next`
from OneDrive sync). Not done here to avoid disrupting the existing setup.

## Visual + mobile-sizing regression (Playwright)
`apps/top-10-web/e2e/table-visual.spec.ts` loads `/preview/table` across the phone-size
matrix (320×568 → 412×915), asserts **no scroll/overflow** and that the felt rendered, and
saves screenshots to `e2e/__screenshots__/` (gitignored).

```bash
# 1) start the dev server (separate terminal)
NODE_OPTIONS=--use-system-ca pnpm --filter @fb/top-10-web dev
# 2) one-time browser install
cd apps/top-10-web && npx playwright install chromium
# 3) run
NO_PROXY="localhost,127.0.0.1" pnpm --filter @fb/top-10-web test:visual
```
Notes baked into `playwright.config.ts`: it targets `127.0.0.1` and passes
`--no-proxy-server` (the corporate proxy otherwise intercepts localhost); the spec uses
`domcontentloaded` (Next's dev HMR socket never lets `networkidle` settle). To adopt true
visual *diffing* later, commit the screenshots as baselines and switch to
`toHaveScreenshot()`.

## The `/preview/table` harness
A dev-only visual harness, **guarded with `notFound()` in production** so it 404s on a
production build. Use its control strip to exercise reveals, the rank-10 celebration, hint
mode (countdown/open + target rank), wrong-attempt dots, withdraw, and creator close-table.
