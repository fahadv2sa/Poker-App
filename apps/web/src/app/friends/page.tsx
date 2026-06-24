import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { RemoveFriendButton } from "@/components/remove-friend-button";
import { RespondRequestButtons } from "@/components/respond-request-buttons";

export const dynamic = "force-dynamic";

function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

const sel = {
  id: true,
  username: true,
  nickname: true,
  playerNumber: true,
  avatarSeed: true,
  metrics: { select: { level: true } },
  avatar: { select: { updatedAt: true } },
} as const;

type Person = {
  id: string;
  username: string;
  nickname: string | null;
  playerNumber: number;
  avatarSeed: string | null;
  metrics: { level: number } | null;
  avatar: { updatedAt: Date } | null;
};

function Avatar({ p }: { p: Person }) {
  const name = p.nickname ?? p.username;
  const src = p.avatar ? `/api/profile/avatar/${p.id}?v=${p.avatar.updatedAt.getTime()}` : null;
  const hue = hueFromSeed(p.avatarSeed ?? p.username);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} className="size-11 rounded-full object-cover ring-1 ring-border" />
  ) : (
    <div
      className="grid size-11 place-items-center rounded-full text-sm font-black text-white"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Row({ p, action }: { p: Person; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar p={p} />
        <div className="min-w-0">
          <div className="truncate font-bold">{p.nickname ?? p.username}</div>
          <div className="num text-xs text-muted-foreground">
            #{p.playerNumber} · المستوى {p.metrics?.level ?? 1}
          </div>
        </div>
      </div>
      {action}
    </div>
  );
}

export default async function FriendsPage() {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) redirect("/login");

  const [incoming, links] = await Promise.all([
    prisma.friendship.findMany({
      where: { addresseeId: me, status: "PENDING" },
      select: { requester: { select: sel }, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: me }, { addresseeId: me }] },
      select: { requesterId: true, requester: { select: sel }, addressee: { select: sel }, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const requests = incoming.map((r) => r.requester);
  const friends = links.map((l) => (l.requesterId === me ? l.addressee : l.requester));

  return (
    <main className="relative mx-auto max-w-3xl overflow-hidden px-4 pb-6 sm:px-6 sm:pb-10 page-top">
      <div aria-hidden className="arena-rail" />

      <PageHeader icon="🤝" title="الأصدقاء" subtitle="قائمة أصدقائك وإدارتهم" />

      {requests.length > 0 ? (
        <Panel accent className="relative z-10 mb-5 p-4 sm:p-6">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
            الطلبات الواردة
            <span className="num rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
              {requests.length}
            </span>
          </h2>
          <div className="flex flex-col">
            {requests.map((p) => (
              <Row key={p.id} p={p} action={<RespondRequestButtons playerNumber={p.playerNumber} />} />
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel className="relative z-10 p-4 sm:p-6">
        <h2 className="mb-1 text-lg font-bold">أصدقائي</h2>
        {friends.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="text-3xl opacity-60" aria-hidden>🤝</span>
            <p className="text-sm text-muted-foreground">
              لا أصدقاء بعد — افتح ملف خصم أثناء اللعب وأرسِل له طلب صداقة.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {friends.map((p) => (
              <Row key={p.id} p={p} action={<RemoveFriendButton playerNumber={p.playerNumber} />} />
            ))}
          </div>
        )}
      </Panel>
    </main>
  );
}
