import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth, signOut } from "@/auth";
import { Logo } from "@/components/logo";
import { HomeMenu } from "@/components/home-menu";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Deterministic gradient hue for the generated avatar fallback (same approach
 *  as profile-view / SeatAvatar — no shared export, so a tiny local copy). */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** One satellite control around the central Quick Play button: round icon chip
 *  + Arabic label. Pure navigation (Link) — routes are unchanged. */
function SatButton({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="group flex w-[4.5rem] flex-col items-center gap-1.5 text-center sm:w-20">
      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-2xl border border-border/70 bg-card/70 text-2xl shadow-[0_8px_22px_rgba(0,0,0,0.4)] backdrop-blur transition group-hover:-translate-y-0.5 group-hover:border-primary/45 group-active:scale-95 sm:size-16"
      >
        {icon}
      </span>
      <span className="text-xs font-semibold leading-tight text-muted-foreground transition group-hover:text-foreground">
        {label}
      </span>
    </Link>
  );
}

/** One item in the fixed bottom bar. `active` marks the current screen. */
function BottomItem({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1 text-[0.7rem] transition",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="text-xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="font-semibold">{label}</span>
    </Link>
  );
}

export default async function HomePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // All dynamic — same canonical sources as the profile page: identity + likes +
  // balance from users/wallet, level from player_metrics, avatar from user_avatars.
  const [user, metrics, avatar] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        nickname: true,
        avatarSeed: true,
        likesReceived: true,
        wallet: { select: { balance: true } },
      },
    }),
    prisma.playerMetrics.findUnique({ where: { userId }, select: { level: true } }),
    prisma.userAvatar.findUnique({ where: { userId }, select: { updatedAt: true } }),
  ]);
  if (!user) redirect("/login");

  const coins = Number(user.wallet?.balance ?? 0n).toLocaleString("en-US");
  const likes = user.likesReceived.toLocaleString("en-US");
  const level = metrics?.level ?? 1;
  const displayName = user.nickname ?? user.username;
  const avatarUrl = avatar
    ? `/api/profile/avatar/${userId}?v=${avatar.updatedAt.getTime()}`
    : null;
  const hue = hueFromSeed(user.avatarSeed ?? user.username);
  const initial = displayName.charAt(0).toUpperCase();

  // Reuses the existing sign-out server action (unchanged) — see auth.ts.
  const logout = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  const avatarRing =
    "ring-2 ring-primary/45 [box-shadow:0_0_22px_color-mix(in_oklch,var(--primary)_25%,transparent)]";

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-24 page-top">
      <div aria-hidden className="arena-rail" />

      {/* ── 1) top bar: ⋯ menu on the RIGHT, logo on the LEFT (RTL: first child
              renders at the right, last child at the left). ───────────────── */}
      <header className="relative z-20 flex items-center justify-between">
        <HomeMenu logoutAction={logout} />
        <div className="flex items-center gap-2 text-lg font-black">
          <Logo className="size-9" />
          <span>فوتبول بي</span>
        </div>
      </header>

      {/* ── 2) profile area: coins+level (right), avatar (center), likes (left). */}
      <section className="relative z-10 mt-7 grid grid-cols-3 items-center">
        {/* right cell */}
        <div className="flex flex-col items-start gap-1.5">
          <span className="coin-pill text-sm">
            🪙 <span className="num font-semibold">{coins}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs text-gold">
            المستوى <span className="num font-bold">{level}</span>
          </span>
        </div>

        {/* center cell — avatar (tap → profile) */}
        <div className="flex justify-center">
          <Link href="/profile" aria-label="الملف الشخصي" className="transition active:scale-95">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className={cn("size-20 rounded-full object-cover sm:size-24", avatarRing)}
              />
            ) : (
              <div
                aria-hidden
                className={cn(
                  "grid size-20 place-items-center rounded-full text-3xl font-black text-white sm:size-24",
                  avatarRing,
                )}
                style={{
                  background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))`,
                }}
              >
                {initial}
              </div>
            )}
          </Link>
        </div>

        {/* left cell */}
        <div className="flex flex-col items-end gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-sm text-primary">
            ❤️ <span className="num font-bold">{likes}</span>
          </span>
          <span className="text-xs text-muted-foreground">إعجاب</span>
        </div>
      </section>

      {/* ── 3) center: Quick Play circle flanked by two icons per side. RTL: the
              first stack (create/join) sits on the RIGHT, the last on the LEFT. */}
      <section className="relative z-10 my-auto flex items-center justify-center gap-3 py-6 sm:gap-5">
        <div className="flex flex-col gap-6">
          <SatButton href="/create-room" icon="♠" label="إنشاء غرفة" />
          <SatButton href="/rooms" icon="♣" label="دخول غرفة" />
        </div>

        <Link
          href="/quick-play"
          aria-label="اللعب السريع"
          className="btn-cta glow-primary group grid size-40 shrink-0 place-items-center rounded-full text-center text-primary-foreground ring-4 ring-primary/20 transition active:scale-95 sm:size-44"
        >
          <span className="flex flex-col items-center gap-1 leading-tight">
            <span aria-hidden className="text-3xl">⚡</span>
            <span className="text-xl font-black">
              اللعب
              <br />
              السريع
            </span>
          </span>
        </Link>

        <div className="flex flex-col gap-6">
          <SatButton href="/stats" icon="📊" label="الإحصائيات" />
          <SatButton href="/bank" icon="🏦" label="البنك" />
        </div>
      </section>

      {/* ── 4) fixed bottom bar — guide · home · settings(profile). Centered to
              the same column width on desktop; safe-area aware on mobile. ──── */}
      <nav
        aria-label="شريط التنقل"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md items-stretch justify-around gap-1 border-t border-border/60 bg-card/85 px-4 pt-2 backdrop-blur pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <BottomItem href="/guide" icon="📖" label="دليل اللعب" />
        <BottomItem href="/" icon="🏠" label="الرئيسية" active />
        <BottomItem href="/profile" icon="⚙️" label="الإعدادات" />
      </nav>
    </main>
  );
}
