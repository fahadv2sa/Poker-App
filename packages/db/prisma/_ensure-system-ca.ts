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
 */
import { spawnSync } from "node:child_process";

if (!(process.env.NODE_OPTIONS ?? "").includes("use-system-ca")) {
  const NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --use-system-ca`.trim();
  const result = spawnSync(
    process.execPath,
    [...process.execArgv, ...process.argv.slice(1)],
    { stdio: "inherit", env: { ...process.env, NODE_OPTIONS } },
  );
  process.exit(result.status ?? 1);
}
