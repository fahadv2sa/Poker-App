import { test, expect } from "@playwright/test";

/**
 * THEME value-identity gate (Phase 1 acceptance). Proves the centralization +
 * tokenization changed NO colour anywhere: it reads the COMPUTED colour styles of every
 * token swatch + every themed utility class (incl. ::before/::after bevels) from the
 * /preview/theme surface and asserts they exactly match the committed baseline.
 *
 * Computed styles are anti-aliasing-immune and normalise `rgb(var(--c-x) / a)` and the
 * old `rgba(...)` to the identical string — so an exact text match is the precise proof
 * of "pixel-for-pixel" colour identity, without screenshot AA noise. Any real colour
 * change (a wrong token/channel) shows up as a changed line. Requires dev server :3000.
 */
const PROPS = [
  "backgroundColor", "backgroundImage", "boxShadow", "color",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "textShadow", "filter", "outlineColor", "fill",
] as const;

test("theme colour computed-style identity (all tokens + utilities)", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1600 });
  await page.goto("/preview/theme", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);

  const snap = await page.evaluate((props) => {
    // Freeze animations/transitions so animated glows (lu-turn, lu-sub-rim) read a stable
    // base value — the gate proves COLOUR identity, not animation frames.
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
    return out;
  }, PROPS as unknown as string[]);

  const text = Object.keys(snap)
    .sort()
    .map((k) => `${k}\n  ${snap[k]}`)
    .join("\n");
  expect(text).toMatchSnapshot("theme-computed.txt");
});
