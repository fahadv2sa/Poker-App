// Shared env loader for the /scripts *.mjs operational tools.
// The API key lives ONLY in packages/db/.env (gitignored) — never hardcoded.
// Reads process.env first (CI / shell override), then packages/db/.env.
//
// Also ensures Node trusts the OS certificate store (corporate TLS
// interception) by re-exec'ing once with --use-system-ca — same pattern and
// guards as packages/db/prisma/_ensure-system-ca.ts. Without this, every
// fetch() from a plain `node scripts/x.mjs` run dies with "fetch failed"
// (seen 2026-07-13: 956 straight failures in import-extra-apifootball).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const onRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_SERVICE_ID;
const optedOut = process.env.FP_SKIP_SYSTEM_CA === '1';
if (!onRailway && !optedOut && !(process.env.NODE_OPTIONS ?? '').includes('use-system-ca')) {
  const NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --use-system-ca`.trim();
  const result = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS },
  });
  process.exit(result.status ?? 1);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fromDotenv(name) {
  try {
    const text = readFileSync(resolve(repoRoot, 'packages/db/.env'), 'utf8');
    const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^"|"$/g, '') : undefined;
  } catch {
    return undefined;
  }
}

export const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY ?? fromDotenv('API_FOOTBALL_KEY');
if (!API_FOOTBALL_KEY) {
  throw new Error('API_FOOTBALL_KEY not set (packages/db/.env or environment).');
}
