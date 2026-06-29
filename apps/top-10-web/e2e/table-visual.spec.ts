import { test, expect } from "@playwright/test";

/**
 * Mobile-sizing + visual regression for the Top Ten live table. For each phone size it
 * asserts the page neither scrolls nor overflows (the height-driven grid must always fit),
 * confirms the felt actually rendered (not an unstyled/error page), and saves a screenshot
 * for visual review/diffing. Addresses the "verify across the phone matrix, not HTTP status"
 * gap from the pre-launch audit.
 */
const SIZES = [
  { w: 320, h: 568, n: "320x568-se1" },
  { w: 360, h: 640, n: "360x640-android-s" },
  { w: 375, h: 667, n: "375x667-se2" },
  { w: 390, h: 844, n: "390x844-iphone12" },
  { w: 412, h: 915, n: "412x915-pixel" },
];

for (const s of SIZES) {
  test(`/preview/table fits ${s.n} with no scroll/overflow`, async ({ page }) => {
    await page.setViewportSize({ width: s.w, height: s.h });
    // NOTE: not "networkidle" — Next's dev HMR socket stays open so it never settles.
    await page.goto("/preview/table", { waitUntil: "domcontentloaded" });

    // the felt rendered (styling applied, not an error/unstyled page)
    await expect(page.locator(".lu-felt")).toBeVisible({ timeout: 20000 });

    // no vertical or horizontal overflow (≤ viewport, 1px tolerance)
    const m = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight,
      ih: window.innerHeight,
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    expect(m.sh, "vertical overflow").toBeLessThanOrEqual(m.ih + 1);
    expect(m.sw, "horizontal overflow").toBeLessThanOrEqual(m.iw + 1);

    await page.screenshot({ path: `e2e/__screenshots__/table-${s.n}.png`, fullPage: false });
  });
}
