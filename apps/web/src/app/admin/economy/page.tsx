import Link from "next/link";
import { recentLedger } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { PageTitle, TableWrap, fmtCoins, fmtDate } from "../_ui";

export const dynamic = "force-dynamic";

export default async function AdminEconomyPage() {
  await requireAdminCan(PERMISSIONS.COINS_READ);
  const rows = await recentLedger({ take: 100 });

  return (
    <div>
      <PageTitle title="الاقتصاد" sub="آخر 100 حركة في السجل المالي (للقراءة فقط)" />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد حركات بعد.</p>
      ) : (
        <TableWrap>
          <thead className="bg-white/5 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-bold">المستخدم</th>
              <th className="px-3 py-2 font-bold">النوع</th>
              <th className="px-3 py-2 font-bold">المبلغ</th>
              <th className="px-3 py-2 font-bold">الرصيد بعدها</th>
              <th className="px-3 py-2 font-bold">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/users/${t.playerNumber}`}
                    className="font-bold text-primary hover:underline"
                  >
                    {t.username}
                  </Link>{" "}
                  <span className="num text-muted-foreground">#{t.playerNumber}</span>
                </td>
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
    </div>
  );
}
