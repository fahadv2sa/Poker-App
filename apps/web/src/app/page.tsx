import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth, signOut } from "@/auth";
import { Logo } from "@/components/logo";
import { HomeMenu } from "@/components/home-menu";
import { UiSoundToggle } from "@/components/ui-sound-toggle";
import { GAMES, type GameEntry } from "@/lib/games";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Deterministic gradient hue for the generated avatar fallback (same approach as
 *  the profile/lobby — a tiny local copy, no shared export). */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** One game tile on the hub. Live → navigates to the game; "soon" → a disabled
 *  placeholder so the full multi-game line-up is visible from day one. */
function GameCard({ game }: { game: GameEntry }) {
  const body = (
    <>
      <span className="grid size-14 place-items-center rounded-2xl text-3xl" aria-hidden>
        {game.icon}
      </span>
      <span className="text-base font-bold">{game.nameAr}</span>
      {game.status === "soon" ? (
        <span className="rounded-full bg-[#0b0f1a] px-2 py-0.5 text-[0.62rem] font-bold text-muted-foreground">
          قريباً
        </span>
      ) : (
        <span className="text-[0.7rem] font-semibold text-primary">العب الآن</span>
      )}
    </>
  );
  const base =
    "panel panel-accent flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl p-4 text-center";
  if (game.status === "live" && game.href) {
    return (
      <Link href={game.href} data-sound="quick-play" className={cn(base, "transition active:scale-95")}>
        {body}
      </Link>
    );
  }
  return (
    <div aria-disabled className={cn(base, "opacity-55")}>
      {body}
    </div>
  );
}

export default async function HubPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Identity only — the hub is platform-level. Coins/level/stats are per-game and
  // live INSIDE each game (e.g. /games/link-up), never on the hub.
  const [user, avatar] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, nickname: true, avatarSeed: true },
    }),
    prisma.userAvatar.findUnique({ where: { userId }, select: { updatedAt: true } }),
  ]);
  if (!user) redirect("/login");

  const displayName = user.nickname ?? user.username;
  const avatarUrl = avatar
    ? `/api/profile/avatar/${userId}?v=${avatar.updatedAt.getTime()}`
    : null;
  const hue = hueFromSeed(user.avatarSeed ?? user.username);
  const initial = displayName.charAt(0).toUpperCase();

  // Reuses the existing sign-out server action (same as the game lobby).
  const logout = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-10 page-top">
      <div aria-hidden className="arena-rail" />

      {/* top bar: platform logo + name (right), sound + menu (left). RTL. */}
      <header className="relative z-30 flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-black">
          <Logo glow className="size-9" />
          <span>فوتبول بي</span>
        </div>
        <div className="flex items-center gap-2">
          <UiSoundToggle />
          {/* Hub is platform-level — no Link Up game guide here (it lives in the game). */}
          <HomeMenu logoutAction={logout} showGuide={false} />
        </div>
      </header>

      {/* identity chrome — avatar + name (tap → profile). No economy here. */}
      <section className="fade-rise relative z-10 mt-6 flex flex-col items-center gap-2">
        <Link href="/profile" aria-label="الملف الشخصي" className="transition active:scale-95">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={displayName}
              className="avatar-glow size-20 rounded-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="avatar-glow grid size-20 place-items-center rounded-full text-3xl font-black text-white"
              style={{
                background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))`,
              }}
            >
              {initial}
            </div>
          )}
        </Link>
        <span className="max-w-[10rem] truncate text-base font-bold">{displayName}</span>
      </section>

      {/* games grid — one card per platform game (see lib/games.ts). */}
      <section className="relative z-10 mt-8">
        <h1 className="mb-4 text-center text-sm font-bold text-muted-foreground">اختر لعبة</h1>
        <div className="grid grid-cols-2 gap-3">
          {GAMES.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>
    </main>
  );
}
