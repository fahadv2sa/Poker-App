import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerDetail, type SeasonStatRow } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { Card, KV, PageTitle, TableWrap, fmtDate } from "../../_ui";

export const dynamic = "force-dynamic";

const DASH = "—";
const n = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? DASH : v);

/** Every season-stat column, in display order — the full statistics[] block. */
const SEASON_COLS: { key: keyof SeasonStatRow; label: string }[] = [
  { key: "season", label: "الموسم" },
  { key: "teamName", label: "النادي" },
  { key: "leagueName", label: "الدوري" },
  { key: "leagueCountry", label: "الدولة" },
  { key: "position", label: "المركز" },
  { key: "shirtNumber", label: "الرقم" },
  { key: "captain", label: "قائد" },
  { key: "rating", label: "التقييم" },
  { key: "appearances", label: "مباريات" },
  { key: "lineups", label: "أساسي" },
  { key: "minutes", label: "دقائق" },
  { key: "subsIn", label: "دخل بديل" },
  { key: "subsOut", label: "خرج" },
  { key: "subsBench", label: "احتياط" },
  { key: "shotsTotal", label: "تسديدات" },
  { key: "shotsOn", label: "على المرمى" },
  { key: "goalsTotal", label: "أهداف" },
  { key: "goalsAssists", label: "صناعة" },
  { key: "goalsConceded", label: "استقبل" },
  { key: "goalsSaves", label: "تصديات" },
  { key: "passesTotal", label: "تمريرات" },
  { key: "passesKey", label: "مفتاحية" },
  { key: "passesAccuracy", label: "دقة%" },
  { key: "tacklesTotal", label: "تدخلات" },
  { key: "tacklesBlocks", label: "صدّ" },
  { key: "tacklesInterceptions", label: "قطع" },
  { key: "duelsTotal", label: "ثنائيات" },
  { key: "duelsWon", label: "فاز بها" },
  { key: "dribblesAttempts", label: "مراوغات" },
  { key: "dribblesSuccess", label: "ناجحة" },
  { key: "dribblesPast", label: "مُرّ منه" },
  { key: "foulsDrawn", label: "أخطاء له" },
  { key: "foulsCommitted", label: "أخطاء عليه" },
  { key: "cardsYellow", label: "صفراء" },
  { key: "cardsYellowRed", label: "ص/ح" },
  { key: "cardsRed", label: "حمراء" },
  { key: "penaltyWon", label: "ركلة له" },
  { key: "penaltyCommitted", label: "ركلة عليه" },
  { key: "penaltyScored", label: "سجّل ركلة" },
  { key: "penaltyMissed", label: "أهدر" },
  { key: "penaltySaved", label: "صدّ ركلة" },
];

function seasonCell(row: SeasonStatRow, key: keyof SeasonStatRow) {
  const v = row[key];
  if (typeof v === "boolean") return v ? "✓" : DASH;
  return n(v as number | string | null);
}

export default async function AdminPlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminCan(PERMISSIONS.FOOTBALL_READ);
  const { id } = await params;
  const p = await getPlayerDetail(id);
  if (!p) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/football" className="text-sm text-muted-foreground hover:underline">
        → كل اللاعبين
      </Link>

      {/* header — photo + name + key badges */}
      <div className="flex items-start gap-4">
        {p.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photoUrl} alt={p.name} className="size-20 rounded-xl border border-white/10 object-cover" />
        ) : (
          <div className="grid size-20 place-items-center rounded-xl border border-white/10 bg-white/5 text-2xl text-muted-foreground">
            ⚽
          </div>
        )}
        <div>
          <PageTitle
            title={`${p.nationality.flagEmoji ? `${p.nationality.flagEmoji} ` : ""}${p.nameAr ?? p.name}`}
            sub={`${p.nationality.name} · ${p.position.nameAr} (${p.position.code})${p.active ? "" : " · غير نشط"}${p.isLegend ? " · ★ أسطورة" : ""}`}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="الهوية والبيانات الشخصية">
          <dl className="text-sm">
            <KV k="الاسم (لاتيني)" v={n(p.name)} />
            <KV k="الاسم (عربي)" v={n(p.nameAr)} />
            <KV k="الاسم الأول" v={n(p.firstName)} />
            <KV k="الاسم الأخير" v={n(p.lastName)} />
            <KV k="المعرّف الخارجي" v={n(p.externalRef)} num />
            <KV k="سنة الميلاد" v={n(p.birthYear)} num />
            <KV k="تاريخ الميلاد" v={n(p.birthDate)} num />
            <KV k="مكان الميلاد" v={n(p.birthPlace)} />
            <KV k="دولة الميلاد" v={n(p.birthCountry)} />
            <KV k="الطول (سم)" v={n(p.heightCm)} num />
            <KV k="الوزن (كغ)" v={n(p.weightKg)} num />
            <KV k="نشط" v={p.active ? "نعم" : "لا"} />
          </dl>
        </Card>

        <Card title="الشهرة والتقييم">
          <dl className="text-sm">
            <KV k="درجة الشهرة" v={p.fameScore !== null ? p.fameScore.toFixed(2) : DASH} num />
            <KV k="متوسط تقييم المباريات" v={p.avgRating !== null ? `${p.avgRating.toFixed(2)} / 10` : DASH} num />
            <KV k="الفئة (Tier)" v={n(p.tier)} num />
            <KV k="مواسم الدوريات الكبرى" v={n(p.top5LeagueSeasons)} num />
            <KV k="أسطورة" v={p.isLegend ? "نعم" : "لا"} />
            <KV k="درجة الأسطورة" v={p.legendScore !== null ? p.legendScore.toFixed(2) : DASH} num />
            <KV k="أُنشئ في" v={fmtDate(p.createdAt)} num />
            <KV k="آخر تحديث" v={fmtDate(p.updatedAt)} num />
          </dl>
        </Card>
      </div>

      {/* computed insights */}
      <Card title="مؤشرات محسوبة">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <KV k="عدد الأندية" v={n(p.distinctClubs)} num />
          <KV k="مسيرة من" v={n(p.careerFrom)} num />
          <KV k="مسيرة إلى" v={n(p.careerTo)} num />
          <KV k="مشاركات البطولات" v={n(p.totalTournamentApps)} num />
          <KV k="إجمالي المباريات" v={n(p.career.apps)} num />
          <KV k="إجمالي الدقائق" v={n(p.career.minutes)} num />
          <KV k="إجمالي الأهداف" v={n(p.career.goals)} num />
          <KV k="إجمالي الصناعة" v={n(p.career.assists)} num />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">اكتمال البيانات</span>
            <span className="num font-bold">{p.completeness}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-primary" style={{ width: `${p.completeness}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {p.completenessParts.map((c) => (
              <span
                key={c.label}
                className={`rounded-lg border px-2 py-1 ${
                  c.present ? "border-primary/30 text-foreground" : "border-white/10 text-muted-foreground"
                }`}
              >
                {c.present ? "✓" : "—"} {c.label}
              </span>
            ))}
          </div>
        </div>
      </Card>

      {/* career */}
      <Card title="المسيرة (الأندية والمنتخبات)">
        <div className="space-y-4 text-sm">
          <div>
            <p className="mb-1 text-muted-foreground">الأندية ({p.clubs.length}):</p>
            {p.clubs.length === 0 ? (
              <p>{DASH}</p>
            ) : (
              <ul className="space-y-1">
                {p.clubs.map((c, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-white/5 py-1 last:border-0">
                    <span className="font-bold">
                      {c.name}
                      {c.country ? <span className="mr-2 text-xs text-muted-foreground">({c.country})</span> : null}
                    </span>
                    <span className="num text-muted-foreground">
                      {c.fromYear ?? "?"}–{c.toYear ?? "الآن"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">المنتخبات ({p.nationalTeams.length}):</p>
            <p>{p.nationalTeams.length ? p.nationalTeams.join("، ") : DASH}</p>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">أندية الناشئين ({p.youthClubs.length}):</p>
            <p>{p.youthClubs.length ? p.youthClubs.join("، ") : DASH}</p>
          </div>
        </div>
      </Card>

      {/* tournaments */}
      <Card title="مشاركات البطولات الكبرى">
        {p.tournaments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{DASH}</p>
        ) : (
          <div className="flex flex-wrap gap-2 text-sm">
            {p.tournaments.map((t) => (
              <span key={t.type} className="rounded-lg border border-white/10 px-3 py-1.5">
                {t.type} <span className="num font-bold">{t.appearances}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* season-by-season — every captured field */}
      <Card title={`إحصائيات المواسم (${p.seasons.length})`}>
        {p.seasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد إحصائيات مواسم لهذا اللاعب.</p>
        ) : (
          <TableWrap>
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                {SEASON_COLS.map((c) => (
                  <th key={String(c.key)} className="whitespace-nowrap px-2 py-2 font-bold">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.seasons.map((row, i) => (
                <tr key={i} className="border-t border-white/5">
                  {SEASON_COLS.map((c) => (
                    <td key={String(c.key)} className="num whitespace-nowrap px-2 py-1.5">
                      {seasonCell(row, c.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
