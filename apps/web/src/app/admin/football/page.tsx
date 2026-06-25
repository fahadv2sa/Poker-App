import Link from "next/link";
import { listPlayers } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { PageTitle, Pager, SearchForm, TableWrap } from "../_ui";

export const dynamic = "force-dynamic";
const TAKE = 50;

export default async function AdminFootballPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; skip?: string }>;
}) {
  await requireAdminCan(PERMISSIONS.FOOTBALL_READ);
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const skip = Math.max(0, Number(sp.skip ?? 0) || 0);
  const { items, total } = await listPlayers({ q, take: TAKE, skip });

  return (
    <div>
      <PageTitle title="بيانات اللاعبين" sub="تصفّح بيانات كرة القدم (للقراءة)" />
      <SearchForm action="/admin/football" placeholder="اسم اللاعب (عربي أو لاتيني)" defaultValue={q} />

      <TableWrap>
        <thead className="bg-white/5 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-bold">الاسم</th>
            <th className="px-3 py-2 font-bold">الجنسية</th>
            <th className="px-3 py-2 font-bold">المركز</th>
            <th className="px-3 py-2 font-bold">الشهرة</th>
            <th className="px-3 py-2 font-bold">الفئة</th>
            <th className="px-3 py-2 font-bold">أسطورة</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
              <td className="px-3 py-2">
                <Link
                  href={`/admin/football/${p.id}`}
                  className="font-bold text-primary hover:underline"
                >
                  {p.nameAr ?? p.name}
                </Link>
                {!p.active ? (
                  <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
                    غير نشط
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{p.nationality}</td>
              <td className="px-3 py-2">{p.position}</td>
              <td className="num px-3 py-2">{p.fameScore !== null ? p.fameScore.toFixed(1) : "—"}</td>
              <td className="num px-3 py-2">{p.tier ?? "—"}</td>
              <td className="px-3 py-2">
                {p.isLegend ? (
                  <span className="text-gold">
                    ★ {p.legendScore !== null ? p.legendScore.toFixed(1) : ""}
                  </span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <Pager basePath="/admin/football" q={q} skip={skip} take={TAKE} total={total} />
    </div>
  );
}
