import Link from "next/link";
import { can, type LiveBotsMeta, type LiveRoomDetail } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { adminGameServerClient } from "@/lib/admin-gameserver";
import { Card, PageTitle, TableWrap, fmtCoins } from "../_ui";
import { BotsToggle, CloseTableButton, KickButton } from "./live-controls";

export const dynamic = "force-dynamic";

interface LiveResult {
  rooms: LiveRoomDetail[];
  bots: LiveBotsMeta;
  error: string | null;
}

async function fetchLive(): Promise<LiveResult> {
  try {
    const live = await adminGameServerClient().getLive();
    return { rooms: live.rooms, bots: live.bots, error: null };
  } catch (e) {
    return {
      rooms: [],
      bots: { enabled: false, paused: false, available: 0 },
      error: e instanceof Error ? e.message : "connection failed",
    };
  }
}

export default async function AdminLivePage() {
  const ctx = await requireAdminCan(PERMISSIONS.GAMES_READ);
  const { rooms, bots, error } = await fetchLive();

  const perms = {
    close: can(ctx, PERMISSIONS.GAMES_FORCE_CLOSE),
    kick: can(ctx, PERMISSIONS.GAMES_KICK_SEAT),
    bots: can(ctx, PERMISSIONS.BOTS_TOGGLE),
  };

  return (
    <div className="space-y-5">
      <PageTitle title="الطاولات المباشرة" sub="الحالة الحيّة والتحكّم من ذاكرة خادم اللعب" />

      {error ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            تعذّر الاتصال بخادم اللعب (قد يكون غير مُحدَّث بعد أو رمز
            <span className="num"> INTERNAL_API_TOKEN </span>غير مضبوط على الخدمتين).
          </p>
          <p className="num mt-1 text-xs text-muted-foreground">{error}</p>
        </Card>
      ) : (
        <>
          <Card title="البوتات">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="num text-muted-foreground">
                {bots.enabled ? (bots.paused ? "موقوفة مؤقتًا" : "مفعّلة") : "غير مفعّلة"} ·{" "}
                {bots.available} متاح
              </span>
              {perms.bots && bots.enabled ? <BotsToggle paused={bots.paused} /> : null}
            </div>
          </Card>

          {rooms.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">لا توجد طاولات نشطة حاليًا.</p>
            </Card>
          ) : (
            rooms.map((r) => {
              const connected = r.seats.filter((s) => s.connected).length;
              return (
                <Card key={r.gameId} title={r.roomName}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="num text-sm text-muted-foreground">
                      {r.kind} · {r.status} · {r.phase} · يد #{r.handNumber} · {connected}/
                      {r.maxPlayers}
                    </p>
                    {perms.close ? <CloseTableButton gameId={r.gameId} /> : null}
                  </div>
                  <TableWrap>
                    <thead className="bg-white/5 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-bold">المقعد</th>
                        <th className="px-3 py-2 font-bold">اللاعب</th>
                        <th className="px-3 py-2 font-bold">النوع</th>
                        <th className="px-3 py-2 font-bold">الحالة</th>
                        <th className="px-3 py-2 font-bold">المراهنة</th>
                        <th className="px-3 py-2 font-bold"></th>
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
                          <td className="px-3 py-2 text-left">
                            {perms.kick && s.connected && !s.isBot ? (
                              <KickButton gameId={r.gameId} seat={s.seat} />
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </Card>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
