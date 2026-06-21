import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { JoinForm } from "./join-form";

/** Arabic labels for the room difficulty (display only). */
const DIFFICULTY_AR: Record<string, string> = {
  EASY: "سهل",
  MEDIUM: "متوسط",
  ELITE: "النخبة",
};

export default async function RoomsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Only manually-created rooms that are still open (LOBBY) are listed. Quick
  // Play rooms (kind=QUICK_PLAY) are matchmaking-only and never appear here;
  // closed rooms (ENDED/ABANDONED) and in-play rooms (IN_PROGRESS) drop off too.
  const found = await prisma.game.findMany({
    where: { kind: "MANUAL", status: "LOBBY" },
    select: {
      id: true,
      roomName: true,
      passwordHash: true, // used only to derive `locked` — never sent to client
      difficulty: true,
      maxPlayers: true,
      creator: { select: { username: true } },
      _count: { select: { players: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // A room is "locked" if it has a password; entry then requires it (verified
  // server-side at the table). Strip the hash before it reaches the client.
  const rooms = found.map(({ passwordHash, ...r }) => ({ ...r, locked: passwordHash !== null }));

  return (
    <main className="relative mx-auto max-w-5xl overflow-hidden px-4 pb-6 sm:px-6 sm:pb-10 page-top">
      <div aria-hidden className="arena-rail" />

      <PageHeader icon="♣" title="دخول غرفة" subtitle="انضمّ بكود دعوة أو من الغرف العامة" accent="cyan" />

      <Panel accent className="relative z-10 mb-4">
        <h2 className="mb-4 text-lg font-bold">دخول بكود</h2>
        <JoinForm />
      </Panel>

      <Panel className="relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">الغرف العامة</h2>
          <span className="rounded-full border border-border/70 px-3 py-1 text-sm text-muted-foreground">
            <span className="num">{rooms.length}</span> غرفة
          </span>
        </div>

        {rooms.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="text-3xl opacity-60" aria-hidden>♣</span>
            <p className="text-muted-foreground">لا توجد غرف عامة الآن — أنشئ واحدة!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rooms.map((r) => (
              <Link
                key={r.id}
                href={`/table/${r.id}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/25 p-4 transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-secondary/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-xl" aria-hidden>
                    {r.locked ? "🔒" : "♣"}
                  </span>
                  <div className="min-w-0">
                    <strong className="block truncate">{r.roomName}</strong>
                    <div className="mt-0.5 text-sm text-muted-foreground">بواسطة {r.creator.username}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">
                        {DIFFICULTY_AR[r.difficulty] ?? r.difficulty}
                      </span>
                      <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
                        {r.locked ? "🔒 خاصة" : "عامة"}
                      </span>
                      <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
                        <span className="num">{r._count.players}</span> /{" "}
                        <span className="num">{r.maxPlayers}</span> لاعبين
                      </span>
                    </div>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-sm font-bold text-primary transition group-hover:bg-primary/15">
                  {r.locked ? "🔒 دخول" : "دخول →"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </main>
  );
}
