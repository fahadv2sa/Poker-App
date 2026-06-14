import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreateRoomForm } from "./create-form";
import { JoinForm } from "./join-form";

export default async function RoomsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const rooms = await prisma.game.findMany({
    where: { isPrivate: false, status: "LOBBY" },
    select: {
      id: true,
      roomName: true,
      maxPlayers: true,
      _count: { select: { players: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          الغُرف
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <div className="mb-6 grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <Card className="p-6 sm:p-8">
          <h2 className="mb-4 text-xl">إنشاء غرفة</h2>
          <CreateRoomForm />
        </Card>
        <Card className="p-6 sm:p-8">
          <h2 className="mb-4 text-xl">دخول بكود</h2>
          <JoinForm />
        </Card>
      </div>

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
                className="flex items-center justify-between rounded-lg border bg-secondary/40 p-4 transition hover:border-primary/45"
              >
                <div>
                  <strong>{r.roomName}</strong>
                  <div className="text-sm text-muted-foreground">
                    <span className="num">{r._count.players}</span> /{" "}
                    <span className="num">{r.maxPlayers}</span> لاعبين
                  </div>
                </div>
                <span className="rounded-full border border-primary/40 px-3 py-1 text-sm text-primary">
                  دخول →
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
