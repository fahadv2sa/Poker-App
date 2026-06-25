import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { can, loadAdminContext } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { ipAllowed } from "@/lib/admin-ip";
import { readAdminSessionUserId } from "@/lib/admin-session";
import { adminLogoutAction } from "./login/actions";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "الرئيسية" },
  { href: "/admin/users", label: "المستخدمون" },
  { href: "/admin/economy", label: "الاقتصاد" },
  { href: "/admin/games", label: "الألعاب" },
  { href: "/admin/football", label: "بيانات اللاعبين" },
  { href: "/admin/live", label: "الطاولات المباشرة" },
];

/**
 * Admin chrome. The IP allowlist (if set) covers the whole /admin area including
 * the login page. Authorization for the DASHBOARD PAGES is enforced by each page
 * (`requireAdminPage`/`requireAdminCan`) — this layout only renders chrome: the
 * nav when an admin session is present, or nothing (login page) when it isn't.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!ipAllowed(process.env.ADMIN_IP_ALLOWLIST, ip)) notFound();

  const userId = await readAdminSessionUserId();
  const ctx = userId ? await loadAdminContext(userId) : null;

  // No admin session (e.g. the login page) → bare chrome, no nav.
  if (!ctx) {
    return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
  }

  const nav = can(ctx, PERMISSIONS.ADMIN_MANAGE)
    ? [...NAV, { href: "/admin/admins", label: "المشرفون" }]
    : NAV;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-black">
            <span className="size-3 rounded-full bg-primary" />
            لوحة التحكم
          </Link>
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[0.7rem] font-bold text-gold">
            {ctx.role === "SUPER_ADMIN" ? "مشرف أعلى" : "مشرف"}
          </span>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-lg px-3 py-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={adminLogoutAction} className="ms-auto">
            <button className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground">
              خروج
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
