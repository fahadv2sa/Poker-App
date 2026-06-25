import Link from "next/link";
import {
  getFootballCoverage,
  getFootballFilterOptions,
  listPlayers,
  type PlayerFilter,
  type PlayerMissing,
  type PlayerSort,
  type PositionCode,
} from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { Card, PageTitle, Pager, TableWrap } from "../_ui";

export const dynamic = "force-dynamic";
const TAKE = 50;

const inputCls =
  "w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50";

const POSITIONS: PositionCode[] = ["GK", "DEF", "MID", "FWD"];
const SORTS: { value: PlayerSort; label: string }[] = [
  { value: "fame_desc", label: "الشهرة (الأعلى)" },
  { value: "fame_asc", label: "الشهرة (الأقل)" },
  { value: "name_asc", label: "الاسم (أ–ي)" },
  { value: "tier_asc", label: "الفئة (1→4)" },
  { value: "birth_desc", label: "الأحدث ميلادًا" },
  { value: "birth_asc", label: "الأقدم ميلادًا" },
];
const MISSING: { value: PlayerMissing; label: string }[] = [
  { value: "photo", label: "بدون صورة" },
  { value: "name_ar", label: "بدون اسم عربي" },
  { value: "fame", label: "بدون درجة شهرة" },
  { value: "clubs", label: "بدون أندية" },
  { value: "season_stats", label: "بدون إحصائيات مواسم" },
];

type SP = Record<string, string | undefined>;

function parseFilter(sp: SP): PlayerFilter {
  const num = (v?: string) => (v && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined);
  const bool = (v?: string) => (v === "1" ? true : v === "0" ? false : undefined);
  const pos = POSITIONS.includes(sp.position as PositionCode) ? (sp.position as PositionCode) : undefined;
  const sort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as PlayerSort) : undefined;
  const missing = MISSING.some((m) => m.value === sp.missing) ? (sp.missing as PlayerMissing) : undefined;
  const tier = num(sp.tier);
  return {
    q: sp.q?.trim() || undefined,
    nationality: sp.nationality?.trim() || undefined,
    position: pos,
    tier: tier && tier >= 1 && tier <= 4 ? tier : undefined,
    legend: bool(sp.legend),
    active: bool(sp.active),
    fameMin: num(sp.fameMin),
    fameMax: num(sp.fameMax),
    club: sp.club?.trim() || undefined,
    missing,
    sort,
  };
}

/** Filter values as query params (for the pager + the export link). */
function filterParams(f: PlayerFilter): Record<string, string | undefined> {
  return {
    q: f.q,
    nationality: f.nationality,
    position: f.position,
    tier: f.tier ? String(f.tier) : undefined,
    legend: f.legend === undefined ? undefined : f.legend ? "1" : "0",
    active: f.active === undefined ? undefined : f.active ? "1" : "0",
    fameMin: f.fameMin !== undefined ? String(f.fameMin) : undefined,
    fameMax: f.fameMax !== undefined ? String(f.fameMax) : undefined,
    club: f.club,
    missing: f.missing,
    sort: f.sort,
  };
}

function pct(n: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

export default async function AdminFootballPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminCan(PERMISSIONS.FOOTBALL_READ);
  const sp = await searchParams;
  const filter = parseFilter(sp);
  const skip = Math.max(0, Number(sp.skip ?? 0) || 0);

  const [{ items, total }, options, cov] = await Promise.all([
    listPlayers({ ...filter, take: TAKE, skip }),
    getFootballFilterOptions(),
    getFootballCoverage(),
  ]);

  const params = filterParams(filter);
  const exportQs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="space-y-5">
      <PageTitle title="بيانات اللاعبين" sub="تصفّح وبحث وتحليل قاعدة بيانات كرة القدم (للقراءة)" />

      {/* coverage / data-quality snapshot */}
      <Card title="نظرة عامة على البيانات">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="إجمالي اللاعبين" value={cov.total.toLocaleString("en-US")} />
          <Stat label="نشطون" value={`${cov.active.toLocaleString("en-US")} · ${pct(cov.active, cov.total)}`} />
          <Stat label="أساطير" value={cov.legends.toLocaleString("en-US")} />
          <Stat label="لديهم درجة شهرة" value={`${cov.withFame.toLocaleString("en-US")} · ${pct(cov.withFame, cov.total)}`} />
          <Stat label="لديهم صورة" value={`${cov.withPhoto.toLocaleString("en-US")} · ${pct(cov.withPhoto, cov.total)}`} />
          <Stat label="لديهم اسم عربي" value={`${cov.withNameAr.toLocaleString("en-US")} · ${pct(cov.withNameAr, cov.total)}`} />
          <Stat label="لديهم أندية" value={`${cov.withClubs.toLocaleString("en-US")} · ${pct(cov.withClubs, cov.total)}`} />
          <Stat label="لديهم إحصائيات مواسم" value={`${cov.withSeasonStats.toLocaleString("en-US")} · ${pct(cov.withSeasonStats, cov.total)}`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {cov.byPosition.map((p) => (
            <span key={p.code} className="rounded-lg border border-white/10 px-2 py-1">
              {p.nameAr} <span className="num font-bold text-foreground">{p.count}</span>
            </span>
          ))}
          {cov.byTier.map((t) => (
            <span key={String(t.tier)} className="rounded-lg border border-white/10 px-2 py-1">
              فئة {t.tier ?? "—"} <span className="num font-bold text-foreground">{t.count}</span>
            </span>
          ))}
        </div>
      </Card>

      {/* filter / search form (GET) */}
      <Card title="البحث والتصفية">
        <form action="/admin/football" method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input name="q" defaultValue={filter.q} placeholder="اسم / رقم خارجي" className={inputCls} />
          <input name="club" defaultValue={filter.club} placeholder="نادٍ (يحتوي)" className={inputCls} />
          <select name="nationality" defaultValue={filter.nationality ?? ""} className={inputCls}>
            <option value="">كل الجنسيات</option>
            {options.nationalities.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <select name="position" defaultValue={filter.position ?? ""} className={inputCls}>
            <option value="">كل المراكز</option>
            {options.positions.map((p) => (
              <option key={p.code} value={p.code}>
                {p.nameAr} ({p.code})
              </option>
            ))}
          </select>
          <select name="tier" defaultValue={filter.tier ? String(filter.tier) : ""} className={inputCls}>
            <option value="">كل الفئات</option>
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                فئة {t}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={filter.sort ?? "fame_desc"} className={inputCls}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                ترتيب: {s.label}
              </option>
            ))}
          </select>

          <select name="legend" defaultValue={filter.legend === undefined ? "" : filter.legend ? "1" : "0"} className={inputCls}>
            <option value="">أسطورة: الكل</option>
            <option value="1">أسطورة فقط</option>
            <option value="0">غير أسطورة</option>
          </select>
          <select name="active" defaultValue={filter.active === undefined ? "" : filter.active ? "1" : "0"} className={inputCls}>
            <option value="">الحالة: الكل</option>
            <option value="1">نشط فقط</option>
            <option value="0">غير نشط</option>
          </select>
          <select name="missing" defaultValue={filter.missing ?? ""} className={inputCls}>
            <option value="">جودة البيانات: الكل</option>
            {MISSING.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <input name="fameMin" defaultValue={filter.fameMin ?? ""} inputMode="numeric" placeholder="شهرة من" className={`${inputCls} num`} />
            <input name="fameMax" defaultValue={filter.fameMax ?? ""} inputMode="numeric" placeholder="إلى" className={`${inputCls} num`} />
          </div>

          <div className="flex gap-2 sm:col-span-2">
            <button className="rounded-lg border border-primary/40 bg-primary/10 px-5 py-2 text-sm font-bold hover:bg-primary/20">
              تطبيق
            </button>
            <Link href="/admin/football" className="rounded-lg border border-white/10 px-5 py-2 text-sm font-bold hover:bg-white/5">
              مسح
            </Link>
            <a
              href={`/admin/football/export${exportQs ? `?${exportQs}` : ""}`}
              className="rounded-lg border border-white/10 px-5 py-2 text-sm font-bold hover:bg-white/5"
            >
              تصدير CSV
            </a>
          </div>
        </form>
      </Card>

      <TableWrap>
        <thead className="bg-white/5 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-bold">الاسم</th>
            <th className="px-3 py-2 font-bold">الجنسية</th>
            <th className="px-3 py-2 font-bold">المركز</th>
            <th className="px-3 py-2 font-bold">الميلاد</th>
            <th className="px-3 py-2 font-bold">الشهرة</th>
            <th className="px-3 py-2 font-bold">الفئة</th>
            <th className="px-3 py-2 font-bold">أسطورة</th>
            <th className="px-3 py-2 font-bold">صورة</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                لا توجد نتائج مطابقة.
              </td>
            </tr>
          ) : (
            items.map((p) => (
              <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-3 py-2">
                  <Link href={`/admin/football/${p.id}`} className="font-bold text-primary hover:underline">
                    {p.nameAr ?? p.name}
                  </Link>
                  {!p.active ? (
                    <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">غير نشط</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.flagEmoji ? `${p.flagEmoji} ` : ""}
                  {p.nationality}
                </td>
                <td className="px-3 py-2">{p.position}</td>
                <td className="num px-3 py-2 text-muted-foreground">{p.birthYear ?? "—"}</td>
                <td className="num px-3 py-2">{p.fameScore !== null ? p.fameScore.toFixed(1) : "—"}</td>
                <td className="num px-3 py-2">{p.tier ?? "—"}</td>
                <td className="px-3 py-2">
                  {p.isLegend ? (
                    <span className="text-gold">★ {p.legendScore !== null ? p.legendScore.toFixed(1) : ""}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.hasPhoto ? "✓" : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </TableWrap>

      <Pager basePath="/admin/football" skip={skip} take={TAKE} total={total} extra={params} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/40 p-3">
      <div className="num text-lg font-black leading-none">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
