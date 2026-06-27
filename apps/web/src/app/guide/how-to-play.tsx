"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * "كيف تلعب" — three tap-to-reveal cards. Collapsed by default; each toggles
 * independently with a smooth grid-rows height reveal (reduced-motion safe).
 * Gold-on-black redesign (docs/DESIGN_BRIEF.md §8) — data/logic unchanged.
 *
 *   - ranks   → the shared HAND_RANK_CATALOG (Card 1)
 *   - badges  → the active rows of the badges table (Card 3)
 * Card 2 is hand-written guidance and uses the exact in-game action vocabulary.
 */

export type RankItem = {
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
};

export type BadgeItem = {
  id: string;
  icon: string;
  nameAr: string;
  descriptionAr: string;
};

function Panel({
  icon,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = useId();

  return (
    <section
      className={cn(
        "lu-frame overflow-hidden rounded-2xl transition-shadow",
        open && "shadow-[0_0_22px_rgba(255,106,26,0.16)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-4 p-4 text-right transition-colors hover:bg-white/[0.03] sm:p-5"
      >
        <span
          aria-hidden
          className="lu-chip grid size-11 shrink-0 place-items-center rounded-xl text-2xl ring-1 ring-[var(--lu-gold-1)]/30"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold text-[var(--lu-cream)] sm:text-lg">{title}</span>
          <span className="mt-0.5 block text-xs leading-snug text-[var(--lu-tan)] sm:text-sm">{subtitle}</span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={cn(
            "size-5 shrink-0 text-[var(--lu-gold-1)] transition-transform duration-300 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* grid-rows 0fr→1fr gives a smooth height reveal with no fixed max-height. */}
      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "border-t border-white/10 p-4 transition-opacity duration-200 sm:p-5",
              open ? "opacity-100 delay-100" : "opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="num lu-chip grid size-7 shrink-0 place-items-center rounded-full text-sm font-black text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/35">
        {n}
      </span>
      <span className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed">
        <strong className="font-bold text-[var(--lu-cream)]">{title} — </strong>
        <span className="text-[var(--lu-tan)]">{children}</span>
      </span>
    </li>
  );
}

export function HowToPlay({ ranks, badges }: { ranks: RankItem[]; badges: BadgeItem[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="flex flex-col gap-3">
      {/* ── Card 1 — Rank guide ────────────────────────────────────────────── */}
      <Panel
        icon="🃏"
        title="دليل الترابطات"
        subtitle="الترابطات التسعة من الأقوى إلى الأضعف وشروط تحقّقها"
        open={!!open.ranks}
        onToggle={() => toggle("ranks")}
      >
        <p className="mb-4 text-sm leading-relaxed text-[var(--lu-tan)]">
          عند الكشف يفوز صاحب الترابط الأقوى المُحقّق. هذه الترابطات مرتّبة من الأقوى (1) إلى الأضعف.
        </p>
        <ul className="flex flex-col gap-2.5">
          {ranks.map((h, i) => (
            <li key={h.code} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <span className="num grid size-8 shrink-0 place-items-center rounded-full text-sm font-black text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/50">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-extrabold text-[var(--lu-cream)]">{h.nameAr}</h3>
                  <span className="text-xs text-[var(--lu-tan)]">{h.nameEn}</span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--lu-tan)]">{h.descriptionAr}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ── Card 2 — How to play / win & lose ──────────────────────────────── */}
      <Panel
        icon="🎮"
        title="شرح طريقة اللعب والمكسب والخسارة"
        subtitle="مجرى الجولة، المراهنة، وكيف يُحسم الفائز"
        open={!!open.howto}
        onToggle={() => toggle("howto")}
      >
        <div className="flex flex-col gap-5 text-sm">
          <div>
            <h3 className="mb-2 font-extrabold text-[var(--lu-gold-1)]">مجرى الجولة</h3>
            <ol className="flex flex-col gap-3">
              <Step n={1} title="الأنتي">
                كل لاعب يدفع <span className="num">50</span> كوين إجباريًا في بداية الجولة لتكوين
                القِدر (مجموع الرهانات على الطاولة).
              </Step>
              <Step n={2} title="توزيع الأوراق">
                تحصل على بطاقتين خاصّتين لا يراهما أحد سواك، ثم تُكشف بطاقات مشتركة على الطاولة
                تدريجيًا عبر الأدوار.
              </Step>
              <Step n={3} title="المراهنة">
                في كل دور تختار: <strong className="text-[var(--lu-cream)]">تمرير</strong> أو{" "}
                <strong className="text-[var(--lu-cream)]">مساواة</strong> الرهان،{" "}
                <strong className="text-[var(--lu-cream)]">رفع</strong> المبلغ،{" "}
                <strong className="text-[var(--lu-cream)]">كل الرصيد</strong>، أو{" "}
                <strong className="text-[var(--lu-cream)]">انسحاب</strong>. لديك{" "}
                <span className="num">60</span> ثانية لكل قرار.
              </Step>
              <Step n={4} title="الكشف">
                في النهاية يكوّن كل لاعب أقوى ترابط من بطاقاته حسب الجنسية والمركز والنادي — راجع
                «دليل الترابطات» في الأعلى.
              </Step>
            </ol>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--lu-gold-1)]/30 bg-[var(--lu-gold-2)]/[0.06] p-4">
              <h3 className="mb-2 flex items-center gap-1.5 font-extrabold text-[var(--lu-gold-1)]">
                <span aria-hidden>🏆</span> كيف تفوز
              </h3>
              <ul className="flex list-disc flex-col gap-1.5 pe-4 text-[var(--lu-tan)]">
                <li>صاحب الترابط الأقوى عند الكشف يكسب القِدر كاملًا ويُضاف إلى رصيدك.</li>
                <li>إذا انسحب كل المنافسين، تكسب القِدر تلقائيًا دون حاجة للكشف.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-[#d9694f]/30 bg-[#d9694f]/[0.06] p-4">
              <h3 className="mb-2 flex items-center gap-1.5 font-extrabold text-[#d9694f]">
                <span aria-hidden>💔</span> كيف تخسر
              </h3>
              <ul className="flex list-disc flex-col gap-1.5 pe-4 text-[var(--lu-tan)]">
                <li>إذا كان ترابطك أضعف عند الكشف، تخسر ما راهنت به في القِدر.</li>
                <li>عند الانسحاب تخسر نصف رهانك فقط (يبقى في القِدر) ويُعاد لك الباقي فورًا.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--lu-gold-1)]/30 bg-[var(--lu-gold-2)]/[0.06] p-4">
            <h3 className="mb-1.5 flex items-center gap-1.5 font-extrabold text-[var(--lu-gold-1)]">
              <span aria-hidden>🪙</span> معنى الكوين
            </h3>
            <p className="leading-relaxed text-[var(--lu-tan)]">
              الكوين هو رصيد اللعب — تكسبه أو تخسره داخل الطاولة فقط. عند نفاده اطلب{" "}
              <span className="num">1000</span> كوين من البنك (حتى مرتين كل <span className="num">24</span>{" "}
              ساعة). لا بيع ولا شراء ولا تحويل.
            </p>
          </div>
        </div>
      </Panel>

      {/* ── Card 3 — Badges ────────────────────────────────────────────────── */}
      <Panel
        icon="🏅"
        title="شرح الشارات وكيفية الحصول عليها"
        subtitle="الشارات تُمنح تلقائيًا حسب أسلوب لعبك"
        open={!!open.badges}
        onToggle={() => toggle("badges")}
      >
        {badges.length > 0 ? (
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {badges.map((b) => (
              <li key={b.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lu-gold-1)]/15 text-2xl ring-1 ring-[var(--lu-gold-1)]/30"
                >
                  {b.icon}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <strong className="font-bold text-[var(--lu-cream)]">{b.nameAr}</strong>
                  <span className="text-sm leading-snug text-[var(--lu-tan)]">{b.descriptionAr}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--lu-tan)]">لا توجد شارات معرّفة حاليًا.</p>
        )}
      </Panel>
    </div>
  );
}
