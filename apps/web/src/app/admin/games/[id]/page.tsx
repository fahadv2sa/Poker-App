import Link from "next/link";
import { notFound } from "next/navigation";
import { getGameDetail } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { Card, KV, PageTitle, TableWrap, fmtCoins, fmtDate } from "../../_ui";

export const dynamic = "force-dynamic";

export default async function AdminGameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminCan(PERMISSIONS.GAMES_READ);
  const { id } = await params;
  const g = await getGameDetail(id);
  if (!g) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/games" className="text-sm text-muted-foreground hover:underline">
        → كل الألعاب
      </Link>
      <PageTitle title={g.roomName} sub={`${g.kind} · ${g.status} · ${g.phase}`} />

      <Card title="التفاصيل">
        <dl className="grid gap-x-6 text-sm sm:grid-cols-2">
          <KV k="الصعوبة" v={g.difficulty} />
          <KV k="المجمّع" v={fmtCoins(g.pot)} num />
          <KV k="المنشئ" v={g.createdBy} />
          <KV k="السعة" v={String(g.maxPlayers)} num />
          <KV k="أُنشئت" v={fmtDate(g.createdAt)} num />
          <KV k="بدأت" v={fmtDate(g.startedAt)} num />
          <KV k="انتهت" v={fmtDate(g.endedAt)} num />
        </dl>
      </Card>

      <Card title="اللاعبون">
        {g.players.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد لاعبون.</p>
        ) : (
          <TableWrap>
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-bold">المقعد</th>
                <th className="px-3 py-2 font-bold">اللاعب</th>
                <th className="px-3 py-2 font-bold">الحالة</th>
                <th className="px-3 py-2 font-bold">إجمالي المراهنة</th>
              </tr>
            </thead>
            <tbody>
              {g.players.map((p) => (
                <tr key={p.seat} className="border-t border-white/5">
                  <td className="num px-3 py-2">{p.seat}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${p.playerNumber}`}
                      className="text-primary hover:underline"
                    >
                      {p.username}
                    </Link>{" "}
                    <span className="num text-muted-foreground">#{p.playerNumber}</span>
                  </td>
                  <td className="px-3 py-2">{p.status}</td>
                  <td className="num px-3 py-2">{fmtCoins(p.committedTotal)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title="النتائج">
        {g.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد نتائج.</p>
        ) : (
          <TableWrap>
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-bold">اللاعب</th>
                <th className="px-3 py-2 font-bold">النتيجة</th>
                <th className="px-3 py-2 font-bold">التغيّر</th>
                <th className="px-3 py-2 font-bold">الرصيد النهائي</th>
              </tr>
            </thead>
            <tbody>
              {g.results.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="px-3 py-2">{r.username}</td>
                  <td className="px-3 py-2">{r.outcome}</td>
                  <td
                    className={`num px-3 py-2 ${r.coinsDelta.startsWith("-") ? "text-destructive" : "text-primary"}`}
                  >
                    {fmtCoins(r.coinsDelta)}
                  </td>
                  <td className="num px-3 py-2">{fmtCoins(r.finalBalance)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
