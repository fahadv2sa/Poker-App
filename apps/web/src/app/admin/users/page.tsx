import Link from "next/link";
import { listUsers } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { PageTitle, Pager, SearchForm, TableWrap, fmtCoins } from "../_ui";

export const dynamic = "force-dynamic";
const TAKE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; skip?: string }>;
}) {
  await requireAdminCan(PERMISSIONS.USERS_READ);
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const skip = Math.max(0, Number(sp.skip ?? 0) || 0);
  const { items, total } = await listUsers({ q, take: TAKE, skip });

  return (
    <div>
      <PageTitle title="المستخدمون" sub="بحث وتصفّح كل الحسابات" />
      <SearchForm action="/admin/users" placeholder="اسم المستخدم أو البريد أو الرقم" defaultValue={q} />

      <TableWrap>
        <thead className="bg-white/5 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-bold">الرقم</th>
            <th className="px-3 py-2 font-bold">المستخدم</th>
            <th className="px-3 py-2 font-bold">البريد</th>
            <th className="px-3 py-2 font-bold">الرصيد</th>
            <th className="px-3 py-2 font-bold">النوع</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id} className="border-t border-white/5 hover:bg-white/5">
              <td className="num px-3 py-2">#{u.playerNumber}</td>
              <td className="px-3 py-2">
                <Link
                  href={`/admin/users/${u.playerNumber}`}
                  className="font-bold text-primary hover:underline"
                >
                  {u.nickname ?? u.username}
                </Link>
                {u.isAdmin ? (
                  <span className="mr-2 rounded bg-gold/15 px-1.5 py-0.5 text-[0.6rem] text-gold">
                    مشرف
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {u.email ?? "—"}
                {u.email && !u.emailVerified ? " (غير مُوثّق)" : ""}
              </td>
              <td className="num px-3 py-2">{fmtCoins(u.balance)}</td>
              <td className="px-3 py-2">{u.isBot ? "بوت" : "بشري"}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <Pager basePath="/admin/users" q={q} skip={skip} take={TAKE} total={total} />
    </div>
  );
}
