import Link from "next/link";
import { listGames } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { PageTitle, Pager, TableWrap, fmtCoins, fmtDate } from "../_ui";

export const dynamic = "force-dynamic";
const TAKE = 50;

const FILTERS: { value?: string; label: string }[] = [
  { value: undefined, label: "الكل" },
  { value: "IN_PROGRESS", label: "قيد اللعب" },
  { value: "LOBBY", label: "في الانتظار" },
  { value: "ENDED", label: "منتهية" },
  { value: "ABANDONED", label: "مهجورة" },
];

export default async function AdminGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; skip?: string }>;
}) {
  await requireAdminCan(PERMISSIONS.GAMES_READ);
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.value === sp.status) ? sp.status : undefined;
  const skip = Math.max(0, Number(sp.skip ?? 0) || 0);
  const { items, total } = await listGames({ status, take: TAKE, skip });

  return (
    <div>
      <PageTitle title="الألعاب" sub="سجلّ الجلسات والطاولات" />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => {
          const active = f.value === status;
          const href = f.value ? `/admin/games?status=${f.value}` : "/admin/games";
          return (
            <Link
              key={f.label}
              href={href}
              className={`rounded-lg border px-3 py-1.5 ${
                active
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-white/10 text-muted-foreground hover:bg-white/5"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <TableWrap>
        <thead className="bg-white/5 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-bold">الغرفة</th>
            <th className="px-3 py-2 font-bold">النوع</th>
            <th className="px-3 py-2 font-bold">الحالة</th>
            <th className="px-3 py-2 font-bold">اللاعبون</th>
            <th className="px-3 py-2 font-bold">المجمّع</th>
            <th className="px-3 py-2 font-bold">أُنشئت</th>
          </tr>
        </thead>
        <tbody>
          {items.map((g) => (
            <tr key={g.id} className="border-t border-white/5 hover:bg-white/5">
              <td className="px-3 py-2">
                <Link
                  href={`/admin/games/${g.id}`}
                  className="font-bold text-primary hover:underline"
                >
                  {g.roomName}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{g.kind}</td>
              <td className="px-3 py-2">{g.status}</td>
              <td className="num px-3 py-2">
                {g.players}/{g.maxPlayers}
              </td>
              <td className="num px-3 py-2">{fmtCoins(g.pot)}</td>
              <td className="num px-3 py-2 text-muted-foreground">{fmtDate(g.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <Pager basePath="/admin/games" skip={skip} take={TAKE} total={total} extra={{ status }} />
    </div>
  );
}
