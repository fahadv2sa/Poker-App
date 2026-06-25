import Link from "next/link";
import { notFound } from "next/navigation";
import { findUserIdByPlayerNumber, getUserDetail } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { Card, KV, PageTitle, TableWrap, fmtCoins, fmtDate } from "../../_ui";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ playerNumber: string }>;
}) {
  await requireAdminCan(PERMISSIONS.USERS_READ);
  const { playerNumber } = await params;
  const pn = Number(playerNumber);
  if (!Number.isInteger(pn)) notFound();

  const userId = await findUserIdByPlayerNumber(pn);
  if (!userId) notFound();
  const u = await getUserDetail(userId);
  if (!u) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="text-sm text-muted-foreground hover:underline">
        → كل المستخدمين
      </Link>
      <PageTitle
        title={u.nickname ?? u.username}
        sub={`#${u.playerNumber} · ${u.isBot ? "بوت" : "بشري"}`}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="الهوية">
          <dl className="text-sm">
            <KV k="اسم المستخدم" v={u.username} />
            <KV k="الاسم المعروض" v={u.nickname ?? "—"} />
            <KV k="البريد" v={u.email ?? "—"} />
            <KV k="حالة التوثيق" v={u.emailVerified ? "مُوثّق" : "غير مُوثّق"} />
            <KV
              k="مشرف"
              v={u.admin ? (u.admin.role === "SUPER_ADMIN" ? "مشرف أعلى" : "مشرف") : "لا"}
            />
            <KV k="آخر نشاط" v={fmtDate(u.lastActiveAt)} num />
            <KV k="أنشئ في" v={fmtDate(u.createdAt)} num />
          </dl>
        </Card>

        <Card title="المحفظة والإحصائيات">
          <dl className="text-sm">
            <KV k="الرصيد" v={u.wallet ? fmtCoins(u.wallet.balance) : "—"} num />
            <KV k="أعلى رصيد" v={u.wallet ? fmtCoins(u.wallet.highestBalance) : "—"} num />
            <KV k="المباريات" v={u.stats ? String(u.stats.gamesPlayed) : "—"} num />
            <KV
              k="فوز / خسارة / انسحاب"
              v={u.stats ? `${u.stats.wins} / ${u.stats.losses} / ${u.stats.folds}` : "—"}
              num
            />
            <KV k="صافي الربح" v={u.stats ? fmtCoins(u.stats.netProfitLoss) : "—"} num />
            <KV k="المستوى / XP" v={u.level !== null ? `${u.level} / ${u.xp}` : "—"} num />
            <KV k="الأصدقاء / الإعجابات" v={`${u.social.friends} / ${u.social.likesReceived}`} num />
          </dl>
        </Card>
      </div>

      <Card title="آخر الحركات المالية">
        {u.recentLedger.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد حركات.</p>
        ) : (
          <TableWrap>
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-bold">النوع</th>
                <th className="px-3 py-2 font-bold">المبلغ</th>
                <th className="px-3 py-2 font-bold">الرصيد بعدها</th>
                <th className="px-3 py-2 font-bold">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {u.recentLedger.map((t) => (
                <tr key={t.id} className="border-t border-white/5">
                  <td className="px-3 py-2">{t.type}</td>
                  <td
                    className={`num px-3 py-2 ${t.amount.startsWith("-") ? "text-destructive" : "text-primary"}`}
                  >
                    {fmtCoins(t.amount)}
                  </td>
                  <td className="num px-3 py-2">{fmtCoins(t.balanceAfter)}</td>
                  <td className="num px-3 py-2 text-muted-foreground">{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
