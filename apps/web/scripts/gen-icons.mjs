// Rasterizes the brand mark (public/logo-mark.svg) into the PWA icon set.
// Static PNGs = no runtime cost, cached by the browser. A solid navy square is
// baked behind the ball so iOS home-screen icons (which ignore transparency)
// render correctly. Re-run with: node scripts/gen-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
// sharp is a hoisted transitive dep (not linked into apps/web); resolve it from
// the monorepo pnpm store so this one-off generator can run from the web package.
const sharpEntry = join(web, "..", "..", "node_modules", ".pnpm", "sharp@0.34.5", "node_modules", "sharp", "lib", "index.js");
const { default: sharp } = await import(pathToFileURL(sharpEntry).href);
const NAVY = "#080b13";

// Inner artwork of logo-mark.svg lives in a 512 box; pull everything after the
// opening <svg ...> tag so we can re-wrap it with our own background + scale.
const raw = readFileSync(join(web, "public", "logo-mark.svg"), "utf8");
const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

/** Compose a full-square icon SVG: navy bg + the ball scaled with `pad` padding. */
function iconSvg(size, pad) {
  const k = (size * (1 - 2 * pad)) / 512;
  const t = (size - 512 * k) / 2;
  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${NAVY}"/>
    <g transform="translate(${t} ${t}) scale(${k})">${inner}</g>
  </svg>`;
}

async function png(out, size, pad) {
  await sharp(Buffer.from(iconSvg(size, pad)))
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("wrote", out);
}

const pub = join(web, "public");
mkdirSync(pub, { recursive: true });

await Promise.all([
  png(join(pub, "icon-192.png"), 192, 0.1),
  png(join(pub, "icon-512.png"), 512, 0.1),
  // maskable: extra padding so nothing is cropped by Android's mask safe-zone
  png(join(pub, "icon-maskable-512.png"), 512, 0.2),
  // Apple touch icon — full-bleed navy (iOS applies its own rounded mask)
  png(join(pub, "apple-icon.png"), 180, 0.12),
  // PNG favicon fallback for older browsers
  png(join(pub, "favicon-32.png"), 32, 0.06),
]);
