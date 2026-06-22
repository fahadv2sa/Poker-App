import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth, signOut } from "@/auth";
import { Logo } from "@/components/logo";
import { HomeMenu } from "@/components/home-menu";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

/** Deterministic gradient hue for the generated avatar fallback (same approach
 *  as profile-view / SeatAvatar — no shared export, so a tiny local copy). */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** One profile stat — an equal-size tone-tinted icon chip + value + label. All
 *  four (coins/level/likes/friends) share `.stat-chip`, so they match exactly.
 *  `href` makes it a navigation control (e.g. Friends → /friends). */
function StatCard({
  icon,
  value,
  label,
  tone,
  href,
}: {
  icon: string;
  value: string;
  label: string;
  tone: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="stat-chip" style={{ "--tone": tone } as CSSProperties} aria-hidden>
        {icon}
      </span>
      <span className="num text-sm font-extrabold leading-none">{value}</span>
      <span className="text-[0.66rem] text-muted-foreground">{label}</span>
    </>
  );
  const cls = "group flex w-16 flex-col items-center gap-1.5 text-center";
  return href ? (
    <Link href={href} className={cn(cls, "transition")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** One satellite control around the central Quick Play orb: icon chip + label.
 *  Pure navigation (Link) — routes are unchanged. */
function SatButton({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="group flex w-[4.75rem] flex-col items-center gap-1.5 text-center">
      <span className="sat-ico" aria-hidden>
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
        "group relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[0.7rem] transition",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active ? <span aria-hidden className="home-tab-active absolute inset-0 rounded-xl" /> : null}
      <span className="relative text-xl leading-none transition group-active:scale-90" aria-hidden>
        {icon}
      </span>
      <span className="relative font-semibold">{label}</span>
    </Link>
  );
}

export default async function HomePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // All dynamic — same canonical sources as the profile page: identity + likes +
  // balance from users/wallet, level from player_metrics, avatar from
  // user_avatars, and the accepted-friends count from friendships.
  const [user, metrics, avatar, friendCount] = await Promise.all([
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
    prisma.friendship.count({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    }),
  ]);
  if (!user) redirect("/login");

  const coins = Number(user.wallet?.balance ?? 0n).toLocaleString("en-US");
  const likes = user.likesReceived.toLocaleString("en-US");
  const friends = friendCount.toLocaleString("en-US");
  const level = (metrics?.level ?? 1).toLocaleString("en-US");
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

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-28 page-top">
      <div aria-hidden className="arena-rail" />

      {/* ── 1) top bar: logo on the RIGHT, ⋯ menu on the LEFT (RTL: first child
              renders at the right, last child at the left). ───────────────── */}
      <header className="relative z-30 flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-black">
          <Logo glow className="size-9" />
          <span>فوتبول بي</span>
        </div>
        <HomeMenu logoutAction={logout} />
      </header>

      {/* ── 2) profile area — framed panel. coins+level (right), avatar (center),
              likes+friends (left). Equal-size stat chips throughout. ──────── */}
      <section className="panel panel-accent fade-rise relative z-10 mt-6 overflow-hidden p-5 sm:p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* right cell */}
          <div className="flex flex-col items-center gap-4">
            <StatCard icon="🪙" value={coins} label="كوين" tone="var(--gold)" />
            <StatCard icon="⭐" value={level} label="المستوى" tone="var(--gold)" />
          </div>

          {/* center cell — avatar (tap → profile) + name */}
          <div className="flex flex-col items-center gap-2">
            <Link href="/profile" aria-label="الملف الشخصي" className="transition active:scale-95">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="avatar-glow size-24 rounded-full object-cover sm:size-28"
                />
              ) : (
                <div
                  aria-hidden
                  className="avatar-glow grid size-24 place-items-center rounded-full text-4xl font-black text-white sm:size-28"
                  style={{
                    background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))`,
                  }}
                >
                  {initial}
                </div>
              )}
            </Link>
            <span className="max-w-[8.5rem] truncate text-sm font-bold">{displayName}</span>
          </div>

          {/* left cell */}
          <div className="flex flex-col items-center gap-4">
            <StatCard icon="❤️" value={likes} label="إعجاب" tone="var(--primary)" />
            <StatCard icon="👥" value={friends} label="الأصدقاء" tone="var(--accent)" href="/friends" />
          </div>
        </div>
      </section>

      {/* ── 3) center play stage — lit orb flanked by two icons per side. RTL: the
              first stack (create/join) sits on the RIGHT, the last on the LEFT. */}
      <section className="play-stage relative z-10 my-auto flex items-center justify-center gap-3 py-8 sm:gap-6">
        <div className="relative z-10 flex flex-col gap-7">
          <SatButton href="/create-room" icon="♠" label="إنشاء غرفة" />
          <SatButton href="/rooms" icon="♣" label="دخول غرفة" />
        </div>

        <Link
          href="/quick-play"
          aria-label="اللعب السريع"
          className="play-orb relative z-10 grid size-44 shrink-0 place-items-center rounded-full text-center text-primary-foreground sm:size-52"
        >
          <span className="flex flex-col items-center gap-1 leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]">
            <span aria-hidden className="text-3xl sm:text-4xl">⚡</span>
            <span className="text-xl font-black sm:text-2xl">
              اللعب
              <br />
              السريع
            </span>
          </span>
        </Link>

        <div className="relative z-10 flex flex-col gap-7">
          <SatButton href="/stats" icon="📊" label="الإحصائيات" />
          <SatButton href="/bank" icon="🏦" label="البنك" />
        </div>
      </section>

      {/* ── 4) fixed bottom bar — guide · home · settings(profile). Centered to
              the same column width on desktop; safe-area aware on mobile. ──── */}
      <nav
        aria-label="شريط التنقل"
        className="home-tabbar fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md items-stretch justify-around gap-1 px-4 pt-2 pb-[max(0.55rem,env(safe-area-inset-bottom))]"
      >
        <BottomItem href="/guide" icon="📖" label="دليل اللعب" />
        <BottomItem href="/" icon="🏠" label="الرئيسية" active />
        <BottomItem href="/profile" icon="⚙️" label="الإعدادات" />
      </nav>
    </main>
  );
}
