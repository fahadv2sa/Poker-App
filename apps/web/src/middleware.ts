import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Host-based routing for the dedicated admin origin.
 *
 * When `ADMIN_HOST` is set (e.g. "panel.fmgtech.dev") and a request arrives on
 * that host, ONLY the admin area is served — every other path redirects to
 * /admin/login, so the admin panel is its own origin/PWA and iOS can never
 * collapse its home-screen icon onto the game (different host).
 *
 * Behind Cloudflare + Railway the real public host can land in `x-forwarded-host`
 * or `nextUrl.host` rather than the raw `host` header, so we match against ALL of
 * them. Safe by default: ADMIN_HOST unset / any other host (the game) → no-op.
 */
export function middleware(req: NextRequest) {
  const adminHost = (process.env.ADMIN_HOST ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  const candidates = [
    req.nextUrl.host,
    req.headers.get("x-forwarded-host"),
    req.headers.get("host"),
  ].map((h) => (h ?? "").toLowerCase().split(",")[0]!.trim());

  const onAdminHost = adminHost !== "" && candidates.includes(adminHost);

  const { pathname } = req.nextUrl;
  const passthrough =
    !onAdminHost || pathname.startsWith("/admin") || pathname.startsWith("/api");

  let res: NextResponse;
  if (passthrough) {
    res = NextResponse.next();
  } else {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    res = NextResponse.redirect(url);
  }

  // TEMP diagnostic (hostnames only, no secrets) — removed once confirmed working.
  res.headers.set(
    "x-fb-mw",
    `admin=${adminHost || "unset"};cands=${candidates.join("|")};match=${onAdminHost}`,
  );
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
