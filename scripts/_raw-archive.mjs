// Raw API-response archiving for the /scripts *.mjs tools — same layout and
// contract as packages/db/prisma/_raw-archive.ts: every response body saved
// BEFORE parsing to %LOCALAPPDATA%\football-b\raw-archive\{endpoint}\{params}.json
// as { meta, body }; idempotent overwrite; failures warn once, never break a run.
// Accepts a path WITH query string (how these scripts call the API).
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT =
  process.env.RAW_ARCHIVE_DIR ??
  resolve(process.env.LOCALAPPDATA ?? tmpdir(), 'football-b', 'raw-archive');

const madeDirs = new Set();
let warnedOnce = false;
const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');

export function archiveRawUrl(pathWithQuery, rawText, httpStatus) {
  try {
    const [p, qs] = String(pathWithQuery).split('?');
    const endpointDir = safe(p.replace(/^\//, '').replace(/\//g, '-')) || 'root';
    const dir = resolve(ROOT, endpointDir);
    if (!madeDirs.has(dir)) {
      mkdirSync(dir, { recursive: true });
      madeDirs.add(dir);
    }
    const params = Object.fromEntries(new URLSearchParams(qs ?? ''));
    const key =
      Object.entries(params)
        .map(([k, v]) => `${safe(k)}-${safe(v)}`)
        .join('-') || 'no-params';
    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = { unparseableRawText: rawText }; // never truncate, never drop
    }
    const record = {
      meta: { endpoint: p, params, fetchedAt: new Date().toISOString(), httpStatus },
      body,
    };
    writeFileSync(resolve(dir, `${key}.json`), JSON.stringify(record));
  } catch (e) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(`[raw-archive] write failed (run continues): ${e.message}`);
    }
  }
}
