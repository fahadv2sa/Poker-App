import { prisma } from "@fb/db";
import { recordAdminAction } from "@fb/admin-core";
import { requireAdminPage } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/**
 * Phase 1 — the secured admin shell. Proves the gate end-to-end: only an active
 * admin reaches this; everyone else 404s in the layout gate. Records a dashboard
 * access in the audit log. (Access-audit granularity is intentionally coarse for
 * now — see DEFERRED_FIXES_LOG D6 — to be refined when real surfaces land.)
 *
 * No visibility or control is wired yet; those arrive in Phase 2+.
 */
export default async function AdminHomePage() {
  const ctx = await requireAdminPage();

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { username: true, playerNumber: true },
  });

  await recordAdminAction({
    actorUserId: ctx.userId,
    action: "admin.dashboard_access",
    metadata: { role: ctx.role },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-2xl font-black">
          <span className="size-3 rounded-full bg-primary" />
          Football B — Control
        </div>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold tracking-wide text-gold">
          {ctx.role}
        </span>
      </header>

      <section className="rounded-2xl border border-white/10 bg-card/70 p-6">
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <p className="mt-1 text-xl font-black">
          {user?.username ?? "—"}{" "}
          <span className="font-mono text-base text-muted-foreground">
            #{user?.playerNumber ?? "—"}
          </span>
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          This is the secured admin gate (Phase 1). Visibility across users, the
          economy, football data, games and live rooms — then guarded control —
          arrive in the next phases.
        </p>
      </section>
    </main>
  );
}
