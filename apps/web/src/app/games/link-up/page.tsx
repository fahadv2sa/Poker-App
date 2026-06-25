import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { BANK_CLAIM_PER_LEVEL, BOT_PLAYER_NUMBER_BASE, INSTALL_REWARD_AMOUNT } from "@fb/shared";
import { auth } from "@/auth";
import { Logo } from "@/components/logo";
import { InstallRewardModal } from "@/components/install-reward-modal";
import { LevelUpModal } from "@/components/level-up-modal";
import { RoomClosedNotice } from "@/components/room-closed-notice";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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

/** A clearly-square nav tile shown just above the bottom bar (global rank /
 *  friends): icon + a value badge + title. Pure navigation (Link). */
function SquareTile({
  href,
  icon,
  title,
  badge,
  tone,
}: {
  href: string;
  icon: string;
  title: string;
  badge: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="home-square group flex flex-col items-center justify-center gap-2 rounded-2xl p-4 text-center"
    >
      <span
        className="relative grid size-12 place-items-center rounded-xl text-2xl"
        style={{
          background: `color-mix(in oklch, ${tone} 16%, transparent)`,
          border: `1px solid color-mix(in oklch, ${tone} 32%, transparent)`,
        }}
        aria-hidden
      >
        {icon}
        <span
          className="num absolute -end-2 -top-2 rounded-full bg-[#0b0f1a] px-1.5 py-0.5 text-[0.62rem] font-bold"
          style={{ border: `1px solid color-mix(in oklch, ${tone} 50%, transparent)`, color: tone }}
        >
          {badge}
        </span>
      </span>
      <span className="text-sm font-bold">{title}</span>
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Set when redirected here from a closed/ABANDONED table link (see table page).
  const roomClosed = (await searchParams).closed === "1";

  // Game-scoped data only — the platform profile (avatar/name/likes/friends) moved
  // to the hub (/) and the wallet balance lives on the Bank page (/bank). Here we
  // need the install-reward flag, level/XP (for rank + the level-up celebration),
  // and the friends count (rank tile badge). Level/XP are shown in /stats.
  const [user, metrics, friendCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        installRewardAt: true,
      },
    }),
    prisma.playerMetrics.findUnique({
      where: { userId },
      select: { level: true, xp: true, celebratedLevel: true },
    }),
    prisma.friendship.count({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    }),
  ]);
  if (!user) redirect("/login");

  // Global rank = position among all HUMAN players by LEVEL (XP tiebreak; bots
  // excluded) — matches the /rank leaderboard the tile opens. One cheap count.
  const myLevel = metrics?.level ?? 1;
  const myXp = metrics?.xp ?? 0n;
  const rankNum =
    (await prisma.playerMetrics.count({
      where: {
        user: { playerNumber: { lt: BOT_PLAYER_NUMBER_BASE } },
        OR: [{ level: { gt: myLevel } }, { level: myLevel, xp: { gt: myXp } }],
      },
    })) + 1;

  const friends = friendCount.toLocaleString("en-US");
  const rank = `#${rankNum.toLocaleString("en-US")}`;
  // One-time "add to home screen" reward state (server-authoritative flag).
  const installRewardClaimed = user.installRewardAt != null;
  const installRewardAmount = Number(INSTALL_REWARD_AMOUNT).toLocaleString("en-US");
  // Level-up celebration: pending when the current level is above the highest
  // already-celebrated level (both server-authoritative). Shows the FINAL new
  // level + the new daily bank amount (level × 1000).
  const levelNum = metrics?.level ?? 1;
  const leveledUp = levelNum > (metrics?.celebratedLevel ?? 1);
  const dailyBankAmount = (Number(BANK_CLAIM_PER_LEVEL) * levelNum).toLocaleString("en-US");

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-28 page-top">
      <div aria-hidden className="arena-rail" />

      {/* ── 1) top bar — brand only: Football B logo on the RIGHT, game name on
              the LEFT (RTL: first child = right, last child = left). The profile,
              sound, and menu now live on the platform hub (/). ─────────────── */}
      <header className="relative z-30 flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-l from-white/[0.05] to-transparent px-4 py-2.5">
        <Logo glow className="size-9" />
        <span className="text-lg font-black tracking-wide">لينك اب</span>
      </header>

      {/* ── 3) center play stage — lit orb flanked by two icons per side. RTL: the
              first stack (create/join) sits on the RIGHT, the last on the LEFT. */}
      <section className="play-stage relative z-10 flex flex-1 items-center justify-center gap-3 py-8 sm:gap-6">
        <div className="relative z-10 flex flex-col gap-7">
          <SatButton href="/create-room" icon="♠" label="إنشاء غرفة" />
          <SatButton href="/rooms" icon="♣" label="دخول غرفة" />
        </div>

        <Link
          href="/quick-play"
          aria-label="اللعب السريع"
          data-sound="quick-play"
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

      {/* ── two square nav tiles just above the bottom bar: global rank + friends.
              Both dynamic (computed rank / accepted-friends count). ────────── */}
      <div className="relative z-10 mt-4 grid grid-cols-2 gap-3">
        <SquareTile href="/rank" icon="🏆" title="الرانك العام" badge={rank} tone="var(--gold)" />
        <SquareTile href="/friends" icon="👥" title="الأصدقاء" badge={friends} tone="var(--accent)" />
      </div>

      {/* ── 4) fixed bottom bar — guide · home · settings(profile). Home (🏠) leads
              to the PLATFORM hub (/) where all games + the profile live. Centered
              to the same column width on desktop; safe-area aware on mobile. ── */}
      <nav
        aria-label="شريط التنقل"
        className="home-tabbar fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md items-stretch justify-around gap-1 px-4 pt-2 pb-[max(0.55rem,env(safe-area-inset-bottom))]"
      >
        <BottomItem href="/guide" icon="📖" label="دليل اللعب" />
        <BottomItem href="/" icon="🏠" label="الرئيسية" />
        <BottomItem href="/profile" icon="⚙️" label="الإعدادات" />
      </nav>

      {/* Level-up celebration (takes priority over the install prompt; on a
          higher z-index). Server-authoritative; only mounted when pending. */}
      {leveledUp ? <LevelUpModal newLevel={levelNum} dailyBank={dailyBankAmount} /> : null}

      {/* One-time "add to home screen" reward — shows only in a browser tab to
          users who haven't claimed; the reward is granted server-side. */}
      <InstallRewardModal claimed={installRewardClaimed} amount={installRewardAmount} />

      {/* Redirected here from a closed/ABANDONED table link → brief notice. */}
      {roomClosed ? <RoomClosedNotice /> : null}
    </main>
  );
}
