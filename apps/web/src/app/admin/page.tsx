import { getOverview } from "@fb/admin-core";
import { requireAdminPage } from "@/lib/admin-guard";
import { Card, PageTitle, StatTile, fmtCoins } from "./_ui";

export const dynamic = "force-dynamic";

/**
 * Dashboard home: cross-domain headline counts (full visibility entry point).
 * No DB write happens during render (D6 fix) — read-access is not audited; every
 * admin WRITE is audited at its action. The gate still enforces admin-only.
 */
export default async function AdminHomePage() {
  await requireAdminPage();
  const o = await getOverview();

  return (
    <div className="space-y-6">
      <PageTitle title="نظرة عامة" sub="رؤية كاملة لكل ما يجري على المنصّة" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="مستخدمون بشريون" value={String(o.users.humans)} />
        <StatTile label="حسابات آلية (بوت)" value={String(o.users.bots)} />
        <StatTile label="المشرفون" value={String(o.users.admins)} />
        <StatTile
          label="إجمالي الكوينز"
          value={fmtCoins(o.economy.totalCoins)}
          sub={`${o.economy.wallets} محفظة`}
        />
      </div>

      <Card title="الألعاب">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="في الانتظار" value={String(o.games.lobby)} />
          <StatTile label="قيد اللعب" value={String(o.games.inProgress)} />
          <StatTile label="منتهية" value={String(o.games.ended)} />
          <StatTile label="مهجورة" value={String(o.games.abandoned)} />
        </div>
      </Card>

      <Card title="بيانات كرة القدم">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="اللاعبون" value={String(o.football.players)} />
          <StatTile label="الأساطير" value={String(o.football.legends)} />
          <StatTile label="الأندية" value={String(o.football.clubs)} />
          <StatTile label="الجنسيات" value={String(o.football.nationalities)} />
        </div>
      </Card>
    </div>
  );
}
