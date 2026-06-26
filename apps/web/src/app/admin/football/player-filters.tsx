"use client";

import { useRef } from "react";

/** Current filter values as plain strings (from the server, parsed from the URL). */
export type FilterValues = Record<string, string | undefined>;

interface Options {
  nationalities: string[];
  positions: { code: string; nameAr: string }[];
}

const SORTS: { value: string; label: string }[] = [
  { value: "fame_desc", label: "الشهرة (الأعلى)" },
  { value: "fame_asc", label: "الشهرة (الأقل)" },
  { value: "name_asc", label: "الاسم (أ–ي)" },
  { value: "tier_asc", label: "الفئة (1→4)" },
  { value: "birth_desc", label: "الأحدث ميلادًا" },
  { value: "birth_asc", label: "الأقدم ميلادًا" },
  { value: "height_desc", label: "الأطول" },
  { value: "weight_desc", label: "الأثقل" },
  { value: "avg_desc", label: "متوسط التقييم (الأعلى)" },
  { value: "avg_asc", label: "متوسط التقييم (الأقل)" },
];
const TOURNAMENTS: { value: string; label: string }[] = [
  { value: "WORLD_CUP", label: "كأس العالم" },
  { value: "EURO_COPA", label: "يورو / كوبا" },
  { value: "CHAMPIONS_LEAGUE", label: "دوري الأبطال" },
];
const MISSING: { value: string; label: string }[] = [
  { value: "photo", label: "بدون صورة" },
  { value: "name_ar", label: "بدون اسم عربي" },
  { value: "fame", label: "بدون درجة شهرة" },
  { value: "clubs", label: "بدون أندية" },
  { value: "season_stats", label: "بدون إحصائيات مواسم" },
];

const input =
  "w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-primary/50";
const label = "mb-1 block text-[0.7rem] font-bold text-muted-foreground";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-white/10 bg-background/30 p-3">
      <legend className="px-1 text-xs font-black text-foreground/80">{title}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
    </fieldset>
  );
}

export function PlayerFilters({ options, current, view }: { options: Options; current: FilterValues; view: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  // Selects/ranges apply instantly; text fields apply on Enter or the Apply button.
  const apply = () => formRef.current?.requestSubmit();
  const v = (k: string) => current[k] ?? "";

  return (
    <form ref={formRef} action="/admin/football" method="get" className="space-y-3">
      {/* keep the chosen view across filter submits */}
      <input type="hidden" name="view" value={view} />

      <Group title="بحث ومطابقة">
        <div className="col-span-2 sm:col-span-1">
          <label className={label}>الاسم / الرقم الخارجي</label>
          <input name="q" defaultValue={v("q")} placeholder="بحث…" className={input} />
        </div>
        <div>
          <label className={label}>نادٍ (المسيرة)</label>
          <input name="club" defaultValue={v("club")} placeholder="يحتوي…" className={input} />
        </div>
        <div>
          <label className={label}>منتخب وطني</label>
          <input name="nationalTeam" defaultValue={v("nationalTeam")} placeholder="يحتوي…" className={input} />
        </div>
      </Group>

      <Group title="التصنيف">
        <div>
          <label className={label}>الجنسية</label>
          <select name="nationality" defaultValue={v("nationality")} onChange={apply} className={input}>
            <option value="">الكل</option>
            {options.nationalities.map((nat) => (
              <option key={nat} value={nat}>
                {nat}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>المركز</label>
          <select name="position" defaultValue={v("position")} onChange={apply} className={input}>
            <option value="">الكل</option>
            {options.positions.map((p) => (
              <option key={p.code} value={p.code}>
                {p.nameAr} ({p.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>الفئة</label>
          <select name="tier" defaultValue={v("tier")} onChange={apply} className={input}>
            <option value="">الكل</option>
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                فئة {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>أسطورة</label>
          <select name="legend" defaultValue={v("legend")} onChange={apply} className={input}>
            <option value="">الكل</option>
            <option value="1">نعم</option>
            <option value="0">لا</option>
          </select>
        </div>
        <div>
          <label className={label}>الحالة</label>
          <select name="active" defaultValue={v("active")} onChange={apply} className={input}>
            <option value="">الكل</option>
            <option value="1">نشط</option>
            <option value="0">غير نشط</option>
          </select>
        </div>
        <div>
          <label className={label}>الترتيب</label>
          <select name="sort" defaultValue={v("sort") || "fame_desc"} onChange={apply} className={input}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </Group>

      <Group title="نطاقات (الشهرة · العمر · الجسم)">
        <div>
          <label className={label}>الشهرة من–إلى</label>
          <div className="flex gap-1">
            <input name="fameMin" defaultValue={v("fameMin")} inputMode="numeric" placeholder="من" className={`${input} num`} />
            <input name="fameMax" defaultValue={v("fameMax")} inputMode="numeric" placeholder="إلى" className={`${input} num`} />
          </div>
        </div>
        <div>
          <label className={label}>سنة الميلاد من–إلى</label>
          <div className="flex gap-1">
            <input name="birthYearMin" defaultValue={v("birthYearMin")} inputMode="numeric" placeholder="من" className={`${input} num`} />
            <input name="birthYearMax" defaultValue={v("birthYearMax")} inputMode="numeric" placeholder="إلى" className={`${input} num`} />
          </div>
        </div>
        <div>
          <label className={label}>متوسط التقييم من–إلى</label>
          <div className="flex gap-1">
            <input name="avgMin" defaultValue={v("avgMin")} inputMode="decimal" placeholder="من" className={`${input} num`} />
            <input name="avgMax" defaultValue={v("avgMax")} inputMode="decimal" placeholder="إلى" className={`${input} num`} />
          </div>
        </div>
        <div>
          <label className={label}>أدنى مواسم مقيّمة</label>
          <input name="ratedMin" defaultValue={v("ratedMin")} inputMode="numeric" placeholder="0" className={`${input} num`} />
        </div>
        <div>
          <label className={label}>الطول (سم) من–إلى</label>
          <div className="flex gap-1">
            <input name="heightMin" defaultValue={v("heightMin")} inputMode="numeric" placeholder="من" className={`${input} num`} />
            <input name="heightMax" defaultValue={v("heightMax")} inputMode="numeric" placeholder="إلى" className={`${input} num`} />
          </div>
        </div>
        <div>
          <label className={label}>الوزن (كغ) من–إلى</label>
          <div className="flex gap-1">
            <input name="weightMin" defaultValue={v("weightMin")} inputMode="numeric" placeholder="من" className={`${input} num`} />
            <input name="weightMax" defaultValue={v("weightMax")} inputMode="numeric" placeholder="إلى" className={`${input} num`} />
          </div>
        </div>
      </Group>

      <Group title="البطولات وجودة البيانات">
        <div>
          <label className={label}>شارك في بطولة</label>
          <select name="tournament" defaultValue={v("tournament")} onChange={apply} className={input}>
            <option value="">الكل</option>
            {TOURNAMENTS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>أدنى مشاركات بطولة</label>
          <input name="tourMin" defaultValue={v("tourMin")} inputMode="numeric" placeholder="0" className={`${input} num`} />
        </div>
        <div>
          <label className={label}>جودة البيانات</label>
          <select name="missing" defaultValue={v("missing")} onChange={apply} className={input}>
            <option value="">الكل</option>
            {MISSING.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </Group>

      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg border border-primary/40 bg-primary/15 px-5 py-2 text-sm font-bold hover:bg-primary/25">
          تطبيق الفلاتر
        </button>
        <a href={`/admin/football?view=${view}`} className="rounded-lg border border-white/10 px-5 py-2 text-sm font-bold hover:bg-white/5">
          مسح الكل
        </a>
      </div>
    </form>
  );
}
