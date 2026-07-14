/**
 * Raw API-response archiving for the API-Football import tooling.
 *
 * Every response body is persisted to disk BEFORE parsing so no paid-for data
 * is ever discarded (injuries, ratings, captain flags, venue/league metadata,
 * paging info — everything the endpoint returned). Wired into the rate-limited
 * apiGet used by all import scripts; archiving failures only warn and NEVER
 * break an import.
 *
 * Location — OUTSIDE OneDrive (frequent small writes + sync don't mix):
 *   %LOCALAPPDATA%\football-b\raw-archive\{endpoint}\{param-key}.json
 * Override with RAW_ARCHIVE_DIR. One JSON file per request:
 *   { meta: { endpoint, params, fetchedAt, httpStatus }, body }
 * Idempotent: re-fetching the same request overwrites its file.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const ROOT =
  process.env.RAW_ARCHIVE_DIR ??
  resolve(process.env.LOCALAPPDATA ?? tmpdir(), "football-b", "raw-archive");

const madeDirs = new Set<string>();
let warnedOnce = false;

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_");

/** Directory receiving the archives (for boot-time logging). */
export const RAW_ARCHIVE_ROOT = ROOT;

export function archiveRaw(
  endpointPath: string,
  params: Record<string, string | number>,
  rawText: string,
  httpStatus: number,
): void {
  try {
    const endpointDir = safe(endpointPath.replace(/^\//, "").replace(/\//g, "-")) || "root";
    const dir = resolve(ROOT, endpointDir);
    if (!madeDirs.has(dir)) {
      mkdirSync(dir, { recursive: true });
      madeDirs.add(dir);
    }
    const key =
      Object.entries(params)
        .map(([k, v]) => `${safe(k)}-${safe(String(v))}`)
        .join("-") || "no-params";
    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = { unparseableRawText: rawText }; // never truncate, never drop
    }
    const record = {
      meta: {
        endpoint: endpointPath,
        params,
        fetchedAt: new Date().toISOString(),
        httpStatus,
      },
      body,
    };
    writeFileSync(resolve(dir, `${key}.json`), JSON.stringify(record));
  } catch (e) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(`[raw-archive] write failed (imports continue): ${(e as Error).message}`);
    }
  }
}
