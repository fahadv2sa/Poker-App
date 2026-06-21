import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          دخول غرفة
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <Card className="mb-4 p-6 sm:p-8">
        <h2 className="mb-4 text-xl">دخول بكود</h2>
        <JoinForm />
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl">الغرف العامة</h2>
          <span className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
            <span className="num">{rooms.length}</span> غرفة
          </span>
        </div>

        {rooms.length === 0 ? (
          <p className="text-muted-foreground">لا توجد غرف عامة الآن — أنشئ واحدة!</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rooms.map((r) => (
              <Link
                key={r.id}
                href={`/table/${r.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-secondary/40 p-4 transition hover:border-primary/45"
              >
                <div className="min-w-0">
                  <strong className="block truncate">{r.roomName}</strong>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    بواسطة {r.creator.username}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">
                      {DIFFICULTY_AR[r.difficulty] ?? r.difficulty}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                      {r.locked ? "🔒 خاصة" : "عامة"}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                      <span className="num">{r._count.players}</span> /{" "}
                      <span className="num">{r.maxPlayers}</span> لاعبين
                    </span>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-primary/40 px-3 py-1 text-sm text-primary">
                  {r.locked ? "🔒 دخول" : "دخول →"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
