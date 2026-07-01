/**
 * THEME GUARDRAIL (CSS side). ESLint enforces "no hardcoded colours" in .ts/.tsx; this
 * covers .css. Colours live ONLY in @fb/theme (packages/theme). Any hex / rgb() / rgba()
 * / hsl() colour LITERAL in any other CSS is an error — use a token: var(--fb-*) or
 * rgb(var(--c-*)). Tokenized forms (var(), rgb(var(...))) are allowed.
 *
 * Run: `node scripts/check-theme-colors.mjs` (wired into `pnpm lint`).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "generated"]);
// @fb/theme is the single source of truth — it is ALLOWED to hold raw colour values.
const ALLOW_PREFIX = join("packages", "theme") + sep;

/** Colour literals that are NOT allowed (numeric rgb/rgba/hsl + hex). Tokenized
 *  forms use var()/rgb(var()) and never match these. */
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(?:rgba?|hsla?)\(\s*[0-9.]/; // a digit right after "(" ⇒ a literal, not var()

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".css")) out.push(p);
  }
}

const files = [];
for (const r of ROOTS) {
  try {
    walk(r, files);
  } catch {
    /* root missing — skip */
  }
}

const violations = [];
for (const f of files) {
  if (f.startsWith(ALLOW_PREFIX)) continue; // @fb/theme is the allowed source
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    // ignore comment-only lines to avoid flagging documented hex in comments
    const code = line.replace(/\/\*.*?\*\//g, "");
    if (HEX.test(code) || FUNC.test(code)) {
      violations.push(`${f}:${i + 1}  ${line.trim()}`);
    }
  });
}

if (violations.length) {
  console.error(
    `\n✗ Hardcoded colour literal(s) found outside @fb/theme (${violations.length}). ` +
      `Colours must come from theme tokens (var(--fb-*) / rgb(var(--c-*))):\n`,
  );
  for (const v of violations) console.error("  " + v);
  console.error("\nUse a token in packages/theme instead.\n");
  process.exit(1);
}
console.log("✓ theme colours: no hardcoded literals outside @fb/theme");
