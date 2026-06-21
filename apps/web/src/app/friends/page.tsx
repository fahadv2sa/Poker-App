import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RemoveFriendButton } from "@/components/remove-friend-button";

export const dynamic = "force-dynamic";

function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

const friendSelect = {
  id: true,
  username: true,
  nickname: true,
  playerNumber: true,
  avatarSeed: true,
  metrics: { select: { level: true } },
  avatar: { select: { updatedAt: true } },
} as const;

export default async function FriendsPage() {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) redirect("/login");

  // Symmetric friendships: the friend is whichever side of the pair isn't me.
  const links = await prisma.friendship.findMany({
    where: { OR: [{ userAId: me }, { userBId: me }] },
    select: {
      userAId: true,
      userBId: true,
      userA: { select: friendSelect },
      userB: { select: friendSelect },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const friends = links.map((l) => (l.userAId === me ? l.userB : l.userA));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          الأصدقاء
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <Card className="p-4 sm:p-6">
        {friends.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            لا أصدقاء بعد — افتح ملف خصم أثناء اللعب وأضِفه كصديق.
          </p>
        ) : (
          <div className="flex flex-col">
            {friends.map((f) => {
              const name = f.nickname ?? f.username;
              const hue = hueFromSeed(f.avatarSeed ?? f.username);
              const src = f.avatar ? `/api/profile/avatar/${f.id}?v=${f.avatar.updatedAt.getTime()}` : null;
              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={name} className="size-10 rounded-full object-cover ring-1 ring-border" />
                    ) : (
                      <div
                        className="grid size-10 place-items-center rounded-full text-sm font-black text-white"
                        style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
                        aria-hidden
                      >
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-bold">{name}</div>
                      <div className="num text-xs text-muted-foreground">
                        #{f.playerNumber} · المستوى {f.metrics?.level ?? 1}
                      </div>
                    </div>
                  </div>
                  <RemoveFriendButton playerNumber={f.playerNumber} />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}
