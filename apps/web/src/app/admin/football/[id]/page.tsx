import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerDetail } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { Card, KV, PageTitle } from "../../_ui";

export const dynamic = "force-dynamic";

export default async function AdminPlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminCan(PERMISSIONS.FOOTBALL_READ);
  const { id } = await params;
  const p = await getPlayerDetail(id);
  if (!p) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/football" className="text-sm text-muted-foreground hover:underline">
        → كل اللاعبين
      </Link>
      <PageTitle title={p.nameAr ?? p.name} sub={`${p.nationality} · ${p.position}`} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="المعلومات">
          <dl className="text-sm">
            <KV k="الاسم (لاتيني)" v={p.name} />
            <KV k="الاسم (عربي)" v={p.nameAr ?? "—"} />
            <KV k="الجنسية" v={p.nationality} />
            <KV k="المركز" v={p.position} />
            <KV k="سنة الميلاد" v={p.birthYear !== null ? String(p.birthYear) : "—"} num />
            <KV k="نشط" v={p.active ? "نعم" : "لا"} />
            <KV k="المعرّف الخارجي" v={p.externalRef !== null ? String(p.externalRef) : "—"} num />
          </dl>
        </Card>

        <Card title="الشهرة والتقييم">
          <dl className="text-sm">
            <KV k="درجة الشهرة" v={p.fameScore !== null ? p.fameScore.toFixed(2) : "—"} num />
            <KV k="الفئة (Tier)" v={p.tier !== null ? String(p.tier) : "—"} num />
            <KV k="أسطورة" v={p.isLegend ? "نعم" : "لا"} />
            <KV
              k="درجة الأسطورة"
              v={p.legendScore !== null ? p.legendScore.toFixed(2) : "—"}
              num
            />
          </dl>
        </Card>
      </div>

      <Card title="الأندية والمنتخبات">
        <div className="text-sm">
          <p className="mb-1 text-muted-foreground">الأندية ({p.clubs.length}):</p>
          <p className="mb-3">{p.clubs.length ? p.clubs.join("، ") : "—"}</p>
          <p className="mb-1 text-muted-foreground">المنتخبات ({p.nationalTeams.length}):</p>
          <p>{p.nationalTeams.length ? p.nationalTeams.join("، ") : "—"}</p>
        </div>
      </Card>
    </div>
  );
}
