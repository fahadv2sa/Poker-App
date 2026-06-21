import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProfileEditor } from "@/components/profile-editor";

export const dynamic = "force-dynamic";

/** Deterministic hue from the avatar seed → a generated fallback avatar (no I/O). */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Read-only values pulled from their canonical sources — never duplicated:
  // identity/nickname (users), balance (wallet), level + won/lost + biggest
  // win/loss (player_metrics). Avatar from user_avatars (else generated).
  const [user, metrics, avatar] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        nickname: true,
        playerNumber: true,
        avatarSeed: true,
        wallet: { select: { balance: true } },
      },
    }),
    prisma.playerMetrics.findUnique({
      where: { userId },
      select: { level: true, totalWon: true, totalLost: true, biggestWin: true, biggestLoss: true },
    }),
    prisma.userAvatar.findUnique({ where: { userId }, select: { updatedAt: true } }),
  ]);
  if (!user) redirect("/login");

  const displayName = user.nickname ?? user.username;
  const avatarSrc = avatar ? `/api/profile/avatar/${userId}?v=${avatar.updatedAt.getTime()}` : null;
  const hue = hueFromSeed(user.avatarSeed ?? user.username);
  const initial = displayName.charAt(0).toUpperCase();

  const k = (n: bigint | number) => `${n.toString()} كوين`;
  const rows: Array<[string, string]> = [
    ["مستوى اللاعب", String(metrics?.level ?? 1)],
    ["عدد الكوينز", k(user.wallet?.balance ?? 0n)],
    ["إجمالي ربح الكوينز", k(metrics?.totalWon ?? 0n)],
    ["إجمالي خسارة الكوينز", k(metrics?.totalLost ?? 0n)],
    ["أكبر رهان رابح", k(metrics?.biggestWin ?? 0n)],
    ["أكبر رهان خاسر", k(metrics?.biggestLoss ?? 0n)],
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          الملف الشخصي
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-4">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt={displayName}
              className="size-16 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div
              className="grid size-16 place-items-center rounded-full text-2xl font-black text-white"
              style={{
                background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))`,
              }}
              aria-hidden
            >
              {initial}
            </div>
          )}
          <div>
            <div className="text-lg font-bold">{displayName}</div>
            <div className="num text-sm text-muted-foreground">
              {user.username} · #{user.playerNumber}
            </div>
          </div>
        </div>

        <div className="flex flex-col">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-border/60 py-3 last:border-0"
            >
              <span className="text-muted-foreground">{label}</span>
              <strong className="num">{value}</strong>
            </div>
          ))}
        </div>

        <ProfileEditor currentNickname={user.nickname} hasAvatar={avatar != null} />

        <Button asChild variant="ghost" className="mt-6 w-full">
          <Link href="/stats">عرض الإحصائيات الكاملة →</Link>
        </Button>
      </Card>
    </main>
  );
}
