import Link from "next/link";
import {
  getFootballCoverage,
  getFootballFilterOptions,
  listPlayers,
  type AdminPlayerListItem,
  type PlayerFilter,
  type PlayerMissing,
  type PlayerSort,
  type PositionCode,
  type TournamentType,
} from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { Card, PageTitle, Pager, TableWrap } from "../_ui";
import { PlayerFilters } from "./player-filters";

export const dynamic = "force-dynamic";
const TAKE = 48;

const POSITIONS = ["GK", "DEF", "MID", "FWD"];
const SORTS = ["fame_desc", "fame_asc", "name_asc", "tier_asc", "birth_desc", "birth_asc", "height_desc", "weight_desc"];
const MISSING = ["photo", "name_ar", "fame", "clubs", "season_stats"];
const TOURNAMENTS = ["WORLD_CUP", "EURO_COPA", "CHAMPIONS_LEAGUE"];

type SP = Record<string, string | undefined>;

function parseFilter(sp: SP): PlayerFilter {
  const num = (v?: string) => (v && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined);
  const bool = (v?: string) => (v === "1" ? true : v === "0" ? false : undefined);
  const inSet = (v: string | undefined, set: string[]) => (set.includes(v ?? "") ? v : undefined);
  const tier = num(sp.tier);
  return {
    q: sp.q?.trim() || undefined,
    nationality: sp.nationality?.trim() || undefined,
    position: inSet(sp.position, POSITIONS) as PositionCode | undefined,
    tier: tier && tier >= 1 && tier <= 4 ? tier : undefined,
    legend: bool(sp.legend),
    active: bool(sp.active),
    fameMin: num(sp.fameMin),
    fameMax: num(sp.fameMax),
    club: sp.club?.trim() || undefined,
    nationalTeam: sp.nationalTeam?.trim() || undefined,
    tournament: inSet(sp.tournament, TOURNAMENTS) as TournamentType | undefined,
    tourMin: num(sp.tourMin),
    birthYearMin: num(sp.birthYearMin),
    birthYearMax: num(sp.birthYearMax),
    heightMin: num(sp.heightMin),
    heightMax: num(sp.heightMax),
    weightMin: num(sp.weightMin),
    weightMax: num(sp.weightMax),
    missing: inSet(sp.missing, MISSING) as PlayerMissing | undefined,
    sort: inSet(sp.sort, SORTS) as PlayerSort | undefined,
  };
}

/** Filter → query params (drives chips, pager, export, and the filter form). */
function filterParams(f: PlayerFilter): Record<string, string | undefined> {
  const s = (v: number | undefined) => (v !== undefined ? String(v) : undefined);
  return {
    q: f.q,
    club: f.club,
    nationalTeam: f.nationalTeam,
    nationality: f.nationality,
    position: f.position,
    tier: s(f.tier),
    legend: f.legend === undefined ? undefined : f.legend ? "1" : "0",
    active: f.active === undefined ? undefined : f.active ? "1" : "0",
    sort: f.sort,
    fameMin: s(f.fameMin),
    fameMax: s(f.fameMax),
    birthYearMin: s(f.birthYearMin),
    birthYearMax: s(f.birthYearMax),
    heightMin: s(f.heightMin),
    heightMax: s(f.heightMax),
    weightMin: s(f.weightMin),
    weightMax: s(f.weightMax),
    tournament: f.tournament,
    tourMin: s(f.tourMin),
    missing: f.missing,
  };
}

// Human labels for the active-filter chips.
const CHIP_LABEL: Record<string, string> = {
  q: "بحث", club: "نادٍ", nationalTeam: "منتخب", nationality: "الجنسية", position: "المركز",
  tier: "الفئة", legend: "أسطورة", active: "الحالة", sort: "ترتيب", fameMin: "شهرة ≥", fameMax: "شهرة ≤",
  birthYearMin: "ميلاد ≥", birthYearMax: "ميلاد ≤", heightMin: "طول ≥", heightMax: "طول ≤",
  weightMin: "وزن ≥", weightMax: "وزن ≤", tournament: "بطولة", tourMin: "مشاركات ≥", missing: "جودة",
};
const CHIP_VALUE: Record<string, (v: string) => string> = {
  legend: (v) => (v === "1" ? "نعم" : "لا"),
  active: (v) => (v === "1" ? "نشط" : "غير نشط"),
  tournament: (v) => ({ WORLD_CUP: "كأس العالم", EURO_COPA: "يورو/كوبا", CHAMPIONS_LEAGUE: "أبطال" })[v] ?? v,
};

function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const s = u.toString();
  return s ? `?${s}` : "";
}

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : "0%";
}

export default async function AdminFootballPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminCan(PERMISSIONS.FOOTBALL_READ);
  const sp = await searchParams;
  const filter = parseFilter(sp);
  const view = sp.view === "cards" ? "cards" : "table";
  const skip = Math.max(0, Number(sp.skip ?? 0) || 0);

  const [{ items, total }, options, cov] = await Promise.all([
    listPlayers({ ...filter, take: TAKE, skip }),
    getFootballFilterOptions(),
    getFootballCoverage(),
  ]);

  const params = filterParams(filter);
  const active = Object.entries(params).filter(([, v]) => v) as [string, string][];
  const exportHref = `/admin/football/export${qs(params)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="بيانات اللاعبين" sub="بحث وتصفية وتحليل قاعدة بيانات كرة القدم (للقراءة)" />
        <div className="flex items-center gap-2 pb-1">
          <ViewToggle view={view} params={params} />
          <a href={exportHref} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold hover:bg-white/5">
            ⬇ تصدير CSV
          </a>
        </div>
      </div>

      {/* coverage / data-quality snapshot */}
      <Card title="نظرة عامة على البيانات">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="إجمالي اللاعبين" value={cov.total.toLocaleString("en-US")} />
          <Stat label="نشطون" value={`${cov.active.toLocaleString("en-US")} · ${pct(cov.active, cov.total)}`} />
          <Stat label="أساطير" value={cov.legends.toLocaleString("en-US")} />
          <Stat label="درجة شهرة" value={`${cov.withFame.toLocaleString("en-US")} · ${pct(cov.withFame, cov.total)}`} />
          <Stat label="صورة" value={`${cov.withPhoto.toLocaleString("en-US")} · ${pct(cov.withPhoto, cov.total)}`} />
          <Stat label="اسم عربي" value={`${cov.withNameAr.toLocaleString("en-US")} · ${pct(cov.withNameAr, cov.total)}`} />
          <Stat label="أندية" value={`${cov.withClubs.toLocaleString("en-US")} · ${pct(cov.withClubs, cov.total)}`} />
          <Stat label="إحصائيات مواسم" value={`${cov.withSeasonStats.toLocaleString("en-US")} · ${pct(cov.withSeasonStats, cov.total)}`} />
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

      {/* filter bar */}
      <Card title="الفلاتر">
        <PlayerFilters options={options} current={params} view={view} />
      </Card>

      {/* active filter chips + result count */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="num font-bold">{total.toLocaleString("en-US")}</span>
        <span className="text-muted-foreground">نتيجة</span>
        {active.length > 0 ? <span className="mx-1 text-muted-foreground">·</span> : null}
        {active.map(([k, v]) => {
          const rest = { ...params, [k]: undefined };
          return (
            <Link
              key={k}
              href={`/admin/football${qs({ ...rest, view })}`}
              className="group inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs hover:bg-primary/20"
            >
              <span className="text-muted-foreground">{CHIP_LABEL[k] ?? k}:</span>
              <span className="font-bold">{(CHIP_VALUE[k]?.(v)) ?? v}</span>
              <span className="text-muted-foreground group-hover:text-foreground">✕</span>
            </Link>
          );
        })}
        {active.length > 0 ? (
          <Link href={`/admin/football?view=${view}`} className="text-xs text-muted-foreground underline hover:text-foreground">
            مسح الكل
          </Link>
        ) : null}
      </div>

      {/* results */}
      {items.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-muted-foreground">لا توجد نتائج مطابقة لهذه الفلاتر.</p>
        </Card>
      ) : view === "cards" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => (
            <PlayerCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <TableWrap>
          <thead className="bg-white/5 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-bold">اللاعب</th>
              <th className="px-3 py-2 font-bold">الجنسية</th>
              <th className="px-3 py-2 font-bold">المركز</th>
              <th className="px-3 py-2 font-bold">الميلاد</th>
              <th className="px-3 py-2 font-bold">الطول</th>
              <th className="px-3 py-2 font-bold">الشهرة</th>
              <th className="px-3 py-2 font-bold">الفئة</th>
              <th className="px-3 py-2 font-bold">أسطورة</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-3 py-2">
                  <Link href={`/admin/football/${p.id}`} className="flex items-center gap-2 font-bold text-primary hover:underline">
                    <Avatar p={p} size={28} />
                    <span>{p.nameAr ?? p.name}</span>
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.flagEmoji ? `${p.flagEmoji} ` : ""}
                  {p.nationality}
                </td>
                <td className="px-3 py-2">
                  <PosBadge code={p.position} />
                </td>
                <td className="num px-3 py-2 text-muted-foreground">{p.birthYear ?? "—"}</td>
                <td className="num px-3 py-2 text-muted-foreground">{p.heightCm ? `${p.heightCm}` : "—"}</td>
                <td className="num px-3 py-2">{p.fameScore !== null ? p.fameScore.toFixed(1) : "—"}</td>
                <td className="num px-3 py-2">{p.tier ?? "—"}</td>
                <td className="px-3 py-2">
                  {p.isLegend ? <span className="text-gold">★ {p.legendScore?.toFixed(1) ?? ""}</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Pager basePath="/admin/football" skip={skip} take={TAKE} total={total} extra={{ ...params, view }} />
    </div>
  );
}

function ViewToggle({ view, params }: { view: string; params: Record<string, string | undefined> }) {
  const mk = (target: string, label: string) => (
    <Link
      href={`/admin/football${qs({ ...params, view: target })}`}
      className={`rounded-lg px-3 py-1.5 text-sm font-bold ${
        view === target ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex rounded-lg border border-white/10 p-0.5">
      {mk("table", "جدول")}
      {mk("cards", "بطاقات")}
    </div>
  );
}

const POS_TONE: Record<string, string> = {
  GK: "text-amber-300 border-amber-300/30 bg-amber-300/10",
  DEF: "text-sky-300 border-sky-300/30 bg-sky-300/10",
  MID: "text-emerald-300 border-emerald-300/30 bg-emerald-300/10",
  FWD: "text-rose-300 border-rose-300/30 bg-rose-300/10",
};
function PosBadge({ code }: { code: string }) {
  return <span className={`rounded-md border px-1.5 py-0.5 text-xs font-bold ${POS_TONE[code] ?? "border-white/10"}`}>{code}</span>;
}

function Avatar({ p, size }: { p: AdminPlayerListItem; size: number }) {
  return p.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.photoUrl} alt="" width={size} height={size} className="rounded-full border border-white/10 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid place-items-center rounded-full border border-white/10 bg-white/5 text-xs" style={{ width: size, height: size }} aria-hidden>
      ⚽
    </span>
  );
}

function PlayerCard({ p }: { p: AdminPlayerListItem }) {
  return (
    <Link
      href={`/admin/football/${p.id}`}
      className="group flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-card/60 p-4 text-center transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      <Avatar p={p} size={64} />
      <div className="min-h-[2.5rem]">
        <div className="line-clamp-2 text-sm font-bold leading-tight">{p.nameAr ?? p.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {p.flagEmoji ? `${p.flagEmoji} ` : ""}
          {p.nationality}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <PosBadge code={p.position} />
        {p.fameScore !== null ? (
          <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
            {p.fameScore.toFixed(0)}
          </span>
        ) : null}
        {p.tier !== null ? (
          <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-xs text-muted-foreground">T{p.tier}</span>
        ) : null}
        {p.isLegend ? <span className="text-gold">★</span> : null}
      </div>
      <div className="num text-[0.7rem] text-muted-foreground">
        {p.birthYear ?? "—"}
        {p.heightCm ? ` · ${p.heightCm}سم` : ""}
        {!p.active ? " · غير نشط" : ""}
      </div>
    </Link>
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
