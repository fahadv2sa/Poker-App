/**
 * Ensures Node trusts the OS/system certificate store before any network I/O.
 *
 * On machines behind a TLS-inspecting antivirus or corporate proxy, the
 * intercepting root CA lives in the Windows certificate store but NOT in Node's
 * bundled CA list, so outbound HTTPS (e.g. the API-Football import) fails with
 * `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Node's `--use-system-ca` flag fixes this,
 * but it must be applied at process launch — too late to set from inside the
 * already-running process. So we re-exec this process exactly once with the
 * flag added to NODE_OPTIONS, preserving the tsx loader (execArgv) and all
 * script args. No external dependency, nothing to install.
 *
 * Import this FIRST, before anything that performs network requests.
 *
 * The re-exec is SKIPPED on managed hosts (Railway) and via an explicit opt-out:
 * there is no TLS interception there, so the flag is unneeded, AND that runtime's
 * Node rejects `--use-system-ca` inside NODE_OPTIONS ("not allowed in
 * NODE_OPTIONS"), which would crash the process (this is exactly what broke the
 * cleanup-cron). The only script that runs on Railway is the abandoned-room
 * cleanup, which talks solely to the internal Postgres — no external HTTPS — so it
 * needs nothing here. Local corporate-TLS machines are unaffected: they either
 * already have NODE_OPTIONS=--use-system-ca preset (guard below skips) or take the
 * re-exec as before.
 */
import { spawnSync } from "node:child_process";

const onRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_SERVICE_ID;
const optedOut = process.env.FP_SKIP_SYSTEM_CA === "1";

if (
  !onRailway &&
  !optedOut &&
  !(process.env.NODE_OPTIONS ?? "").includes("use-system-ca")
) {
  const NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --use-system-ca`.trim();
  const result = spawnSync(
    process.execPath,
    [...process.execArgv, ...process.argv.slice(1)],
    { stdio: "inherit", env: { ...process.env, NODE_OPTIONS } },
  );
  process.exit(result.status ?? 1);
}
