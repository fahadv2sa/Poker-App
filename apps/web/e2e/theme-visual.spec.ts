import { test, expect } from "@playwright/test";

/**
 * THEME value-identity + per-theme regression gate. Reads the COMPUTED colour styles of
 * every token swatch + every themed utility class (incl. ::before/::after) from
 * /preview/theme, forcing each numbered theme via data-theme, and asserts each matches its
 * committed baseline. Computed styles are anti-aliasing-immune and normalise
 * `rgb(var(--c-x)/a)` == `rgba(...)`, so this is exact.
 *
 *  - Theme 0 baseline (theme-computed.txt) was captured at the pixel-identical Phase-1
 *    state → it must STILL match (proves the kept "Gold on Black" theme is unchanged).
 *  - Theme 1 (Daylight) has its own baseline (the intended new look).
 * Requires the dev server on :3000.
 */
const PROPS = [
  "backgroundColor", "backgroundImage", "boxShadow", "color",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "textShadow", "filter", "outlineColor", "fill",
] as const;

async function snapshotTheme(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 900, height: 1600 });
  await page.goto("/preview/theme", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  return page.evaluate((props) => {
    document.documentElement.setAttribute("data-theme", (window as unknown as { __t: string }).__t);
    // Freeze animations/transitions so animated glows read a stable base value.
    const kill = document.createElement("style");
    kill.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
    document.head.appendChild(kill);
    const read = (el: Element, pseudo?: string) => {
      const cs = getComputedStyle(el, pseudo);
      return (props as readonly string[])
        .map((p) => `${p}=${cs[p as keyof CSSStyleDeclaration] as string}`)
        .join(" | ");
    };
    const out: Record<string, string> = {};
    for (const el of Array.from(document.querySelectorAll("[data-probe]"))) {
      const key = el.getAttribute("data-probe") as string;
      out[key] = read(el);
      out[`${key}::before`] = read(el, "::before");
      out[`${key}::after`] = read(el, "::after");
    }
    return Object.keys(out).sort().map((k) => `${k}\n  ${out[k]}`).join("\n");
  }, PROPS as unknown as string[]);
}

test("Theme 0 (Gold on Black) colour identity — unchanged from Phase 1 baseline", async ({ page }) => {
  await page.addInitScript(() => ((window as unknown as { __t: string }).__t = "0"));
  const text = await snapshotTheme(page);
  expect(text).toMatchSnapshot("theme-computed.txt");
});

test("Theme 1 (Daylight) colour baseline", async ({ page }) => {
  await page.addInitScript(() => ((window as unknown as { __t: string }).__t = "1"));
  const text = await snapshotTheme(page);
  expect(text).toMatchSnapshot("theme-1-computed.txt");
});
