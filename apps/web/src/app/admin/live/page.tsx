import Link from "next/link";
import { createHttpAdminGameServerClient, type LiveRoomDetail } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { Card, PageTitle, TableWrap, fmtCoins } from "../_ui";

export const dynamic = "force-dynamic";

async function fetchLiveRooms(): Promise<{ rooms: LiveRoomDetail[]; error: string | null }> {
  const base =
    process.env.GAME_SERVER_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ??
    "http://localhost:4000";
  try {
    const client = createHttpAdminGameServerClient({
      baseUrl: base,
      token: process.env.INTERNAL_API_TOKEN,
    });
    return { rooms: await client.listRoomsDetailed(), error: null };
  } catch (e) {
    return { rooms: [], error: e instanceof Error ? e.message : "connection failed" };
  }
}

export default async function AdminLivePage() {
  await requireAdminCan(PERMISSIONS.GAMES_READ);
  const { rooms, error } = await fetchLiveRooms();

  return (
    <div className="space-y-5">
      <PageTitle title="الطاولات المباشرة" sub="الحالة الحيّة من ذاكرة خادم اللعب (للقراءة)" />

      {error ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            تعذّر جلب الطاولات المباشرة (قد يكون خادم اللعب غير مُحدَّث بعد أو رمز
            <span className="num"> INTERNAL_API_TOKEN </span>غير مضبوط).
          </p>
          <p className="num mt-1 text-xs text-muted-foreground">{error}</p>
        </Card>
      ) : rooms.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">لا توجد طاولات نشطة حاليًا.</p>
        </Card>
      ) : (
        rooms.map((r) => {
          const connected = r.seats.filter((s) => s.connected).length;
          return (
            <Card key={r.gameId} title={r.roomName}>
              <p className="num mb-3 text-sm text-muted-foreground">
                {r.kind} · {r.status} · {r.phase} · يد #{r.handNumber} · {connected}/{r.maxPlayers}
              </p>
              <TableWrap>
                <thead className="bg-white/5 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-bold">المقعد</th>
                    <th className="px-3 py-2 font-bold">اللاعب</th>
                    <th className="px-3 py-2 font-bold">النوع</th>
                    <th className="px-3 py-2 font-bold">الحالة</th>
                    <th className="px-3 py-2 font-bold">المراهنة</th>
                  </tr>
                </thead>
                <tbody>
                  {r.seats.map((s) => (
                    <tr key={s.seat} className="border-t border-white/5">
                      <td className="num px-3 py-2">
                        {s.seat}
                        {r.currentTurnSeat === s.seat ? " ▶" : ""}
                        {r.dealerSeat === s.seat ? " (D)" : ""}
                      </td>
                      <td className="px-3 py-2">
                        {s.isBot ? (
                          <span>{s.username}</span>
                        ) : (
                          <Link
                            href={`/admin/users/${s.playerNumber}`}
                            className="text-primary hover:underline"
                          >
                            {s.username}
                          </Link>
                        )}{" "}
                        <span className="num text-muted-foreground">#{s.playerNumber}</span>
                      </td>
                      <td className="px-3 py-2">{s.isBot ? "بوت" : "بشري"}</td>
                      <td className="px-3 py-2">
                        {s.status}
                        {!s.connected ? " (منقطع)" : ""}
                      </td>
                      <td className="num px-3 py-2">{fmtCoins(s.committedTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Card>
          );
        })
      )}
    </div>
  );
}
