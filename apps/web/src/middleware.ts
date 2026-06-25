import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Host-based routing for the dedicated admin origin.
 *
 * When `ADMIN_HOST` is set (e.g. "panel.fmgtech.dev") and a request arrives on
 * that host, ONLY the admin area is served — every other path redirects to
 * /admin/login. This makes the admin panel its own ORIGIN (and PWA), so iOS can
 * never collapse the admin home-screen icon onto the game, which lives on a
 * different host. The game host is untouched.
 *
 * SAFE BY DEFAULT: if `ADMIN_HOST` is unset, or the request is on any other host
 * (the game), this is a no-op — the game behaves exactly as before.
 */
export function middleware(req: NextRequest) {
  const adminHost = process.env.ADMIN_HOST;
  if (!adminHost) return NextResponse.next();

  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (host !== adminHost.toLowerCase()) return NextResponse.next();

  // On the admin host: admin pages, API (used by the admin UI), and Next
  // internals pass through; everything else goes to the admin login.
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals + any static file (has a dot: .png/.webmanifest/.js/...).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
