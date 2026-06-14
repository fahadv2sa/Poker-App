import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
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
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          الغُرف
        </div>
        <Link href="/" className="btn btn-ghost">
          ← القائمة
        </Link>
      </header>

      <div className="menu-grid" style={{ alignItems: "start", marginBottom: "1.5rem" }}>
        <section className="card pad-lg stack">
          <h2>إنشاء غرفة</h2>
          <CreateRoomForm />
        </section>
        <section className="card pad-lg stack">
          <h2>دخول بكود</h2>
          <JoinForm />
        </section>
      </div>

      <section className="card pad-lg stack">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>الغرف العامة</h2>
          <span className="pill">
            <span className="num">{rooms.length}</span> غرفة
          </span>
        </div>

        {rooms.length === 0 ? (
          <p className="muted">لا توجد غرف عامة الآن — أنشئ واحدة!</p>
        ) : (
          <div className="stack" style={{ gap: "0.5rem" }}>
            {rooms.map((r) => (
              <Link
                key={r.id}
                href={`/table/${r.id}`}
                className="card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <div>
                  <strong>{r.roomName}</strong>
                  <div className="muted small">
                    <span className="num">{r._count.players}</span> /{" "}
                    <span className="num">{r.maxPlayers}</span> لاعبين
                  </div>
                </div>
                <span className="pill live">دخول →</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
