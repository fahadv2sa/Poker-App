/**
 * Optional IP allowlist for the /admin area. When `ADMIN_IP_ALLOWLIST` is set
 * (comma-separated IPs), only those source IPs may reach the dashboard; everyone
 * else 404s (same no-leak posture as a non-admin). When the env var is unset or
 * empty, there is NO restriction — the feature is opt-in.
 *
 * Pure + testable: the request IP is resolved by the caller (from x-forwarded-for).
 */
export function ipAllowed(allowlist: string | undefined, ip: string | null): boolean {
  const list = (allowlist ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true; // not configured → unrestricted
  return ip != null && list.includes(ip);
}
