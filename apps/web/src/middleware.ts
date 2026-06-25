import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Host-based routing for the dedicated admin origin.
 *
 * Requests on an admin host get the admin-only panel: every non-admin path
 * redirects to /admin/login, so the panel is its own origin/PWA and iOS can never
 * collapse its home-screen icon onto the game (a different host).
 *
 * The admin host is HARDCODED so the feature can never silently depend on a
 * Railway variable being set/applied (the original failure). `ADMIN_HOST` only
 * ADDS extra hosts if ever needed. Behind Cloudflare + Railway the real public
 * host arrives in `host` / `x-forwarded-host` (nextUrl.host is the internal
 * localhost), so we match all three. The game host is left untouched.
 */
function normHost(h: string | null): string {
  return (h ?? "")
    .toLowerCase()
    .split(",")[0]!
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

const ADMIN_HOSTS = new Set(
  ["panel.fmgtech.dev", process.env.ADMIN_HOST ?? ""].map(normHost).filter(Boolean),
);

export function middleware(req: NextRequest) {
  const candidates = [
    req.headers.get("host"),
    req.headers.get("x-forwarded-host"),
    req.nextUrl.host,
  ].map(normHost);

  const onAdminHost = candidates.some((c) => ADMIN_HOSTS.has(c));

  const { pathname } = req.nextUrl;
  const passthrough =
    !onAdminHost || pathname.startsWith("/admin") || pathname.startsWith("/api");

  if (passthrough) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
