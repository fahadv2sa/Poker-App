// Regenerate the PWA/home-screen app icons as FULL-BLEED dark squares.
//
// The previous icons baked a WHITE background behind a centered rounded "card"
// holding the gold emblem, so iOS/Android (which round the icon themselves)
// showed an ugly white border/frame around it. This generator takes the existing
// emblem art (public/icon-512.png), flood-fills away the border-connected white
// margin, and re-composites the emblem centered on a SOLID, edge-to-edge dark
// square — so the OS has no empty space to pad with white.
//
// Re-run with:  node scripts/gen-app-icon.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const pub = join(web, "public");
// sharp is a hoisted transitive dep (not linked into apps/web); resolve it from
// the monorepo pnpm store so this one-off generator can run from the web package.
const sharpEntry = join(web, "..", "..", "node_modules", ".pnpm", "sharp@0.34.5", "node_modules", "sharp", "lib", "index.js");
const { default: sharp } = await import(pathToFileURL(sharpEntry).href);

const SRC = join(pub, "icon-512.png");

// 1) Load the emblem art as raw RGB.
const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const idx = (x, y) => (y * W + x) * 3;
const nearWhite = (x, y) => {
  const i = idx(x, y);
  return Math.min(data[i], data[i + 1], data[i + 2]) > 150;
};

// 2) Flood-fill the border-connected white margin → mark it as "outside". Because
//    the fill only spreads from the edges through near-white pixels and the card
//    edge is a sharp white→dark transition, the emblem's interior gold highlights
//    (not reachable from the border) are never touched.
const outside = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) { stack.push(x, 0, x, H - 1); }
for (let y = 0; y < H; y++) { stack.push(0, y, W - 1, y); }
while (stack.length) {
  const y = stack.pop(), x = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (outside[p]) continue;
  if (!nearWhite(x, y)) continue;
  outside[p] = 1;
  stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}

// 3) Pick the fill dark by sampling the card's own dark ring just inside its
//    straight edges (the molten near-black), so the new margin is seamless with
//    the art instead of a foreign flat color.
const samples = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (outside[p]) continue;
    // a thin band just inside wherever the "outside" region borders the card
    const border = (outside[p - 1] || outside[p + 1] || outside[p - W] || outside[p + W]);
    if (!border) continue;
    const i = idx(x, y);
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (lum < 60) samples.push([data[i], data[i + 1], data[i + 2]]); // dark troughs only
  }
}
const med = (arr, k) => { const s = arr.map((c) => c[k]).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const BG = samples.length ? { r: med(samples, 0), g: med(samples, 1), b: med(samples, 2) } : { r: 13, g: 10, b: 8 };
console.log(`fill dark = rgb(${BG.r},${BG.g},${BG.b}) from ${samples.length} edge samples`);

// 4) Paint the outside region with the fill dark → a full-bleed dark 512 base
//    with the emblem centered exactly where it already sits.
for (let p = 0; p < W * H; p++) {
  if (!outside[p]) continue;
  const i = p * 3;
  data[i] = BG.r; data[i + 1] = BG.g; data[i + 2] = BG.b;
}
const base512 = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

// 5) Emit the icon set. Standard icons keep the emblem at its natural size (now
//    on a dark margin instead of white). The maskable icon shrinks the same
//    full-bleed base into Android's safe zone, still on a full-bleed dark square.
const bgCss = { r: BG.r, g: BG.g, b: BG.b };
async function write(out, size, scale) {
  let img;
  if (scale >= 0.999) {
    img = sharp(base512).resize(size, size);
  } else {
    const inner = Math.round(size * scale);
    const pad = Math.round((size - inner) / 2);
    img = sharp({ create: { width: size, height: size, channels: 3, background: bgCss } })
      .composite([{ input: await sharp(base512).resize(inner, inner).png().toBuffer(), top: pad, left: pad }]);
  }
  await img.png({ compressionLevel: 9 }).toFile(out);
  console.log("wrote", out);
}

await write(join(pub, "icon-512.png"), 512, 1);
await write(join(pub, "icon-192.png"), 192, 1);
await write(join(pub, "apple-icon.png"), 180, 1);
// maskable: emblem inside the ~80% safe zone, full-bleed dark behind.
await write(join(pub, "icon-maskable-512.png"), 512, 0.78);
