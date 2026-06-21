"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * "كيف تلعب" — three tap-to-reveal cards. Collapsed by default; each toggles
 * independently with a smooth grid-rows height reveal (reduced-motion safe).
 *
 * Data is passed in from the server page so the content stays data-driven:
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

type Accent = "gold" | "primary" | "accent";

const ACCENT: Record<
  Accent,
  { chip: string; openBorder: string; openGlow: string; chevron: string }
> = {
  gold: {
    chip: "bg-gold/15 text-gold ring-1 ring-gold/30",
    openBorder: "border-gold/45",
    openGlow: "shadow-[0_0_22px_rgba(212,175,55,0.14)]",
    chevron: "text-gold",
  },
  primary: {
    chip: "bg-primary/15 text-primary ring-1 ring-primary/30",
    openBorder: "border-primary/45",
    openGlow: "shadow-[0_0_22px_color-mix(in_oklch,var(--primary)_22%,transparent)]",
    chevron: "text-primary",
  },
  accent: {
    chip: "bg-accent/15 text-accent ring-1 ring-accent/30",
    openBorder: "border-accent/45",
    openGlow: "shadow-[0_0_22px_color-mix(in_oklch,var(--accent)_22%,transparent)]",
    chevron: "text-accent",
  },
};

function Panel({
  icon,
  title,
  subtitle,
  accent,
  open,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  accent: Accent;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = useId();
  const a = ACCENT[accent];

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors",
        open ? cn(a.openBorder, a.openGlow) : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-4 p-4 text-right transition-colors hover:bg-secondary/30 sm:p-5"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl text-2xl",
            a.chip,
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold text-foreground sm:text-lg">
            {title}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground sm:text-sm">
            {subtitle}
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={cn(
            "size-5 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
            a.chevron,
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
              "border-t border-border/60 p-4 transition-opacity duration-200 sm:p-5",
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
      <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-black text-primary">
        {n}
      </span>
      <span className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed">
        <strong className="font-bold text-foreground">{title} — </strong>
        <span className="text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}

export function HowToPlay({ ranks, badges }: { ranks: RankItem[]; badges: BadgeItem[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="flex flex-col gap-3">
      {/* ── Card 1 — Rank guide (gold) ─────────────────────────────────────── */}
      <Panel
        icon="🃏"
        title="دليل الترابطات"
        subtitle="الترابطات التسعة من الأقوى إلى الأضعف وشروط تحقّقها"
        accent="gold"
        open={!!open.ranks}
        onToggle={() => toggle("ranks")}
      >
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          عند الكشف يفوز صاحب الترابط الأقوى المُحقّق. هذه الترابطات مرتّبة من الأقوى (1) إلى الأضعف.
        </p>
        <ul className="flex flex-col gap-2.5">
          {ranks.map((h, i) => (
            <li
              key={h.code}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3"
            >
              <span className="num grid size-8 shrink-0 place-items-center rounded-full border border-gold/50 bg-gold/10 text-sm font-black text-gold">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-extrabold text-foreground">{h.nameAr}</h3>
                  <span className="text-xs text-muted-foreground">{h.nameEn}</span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  {h.descriptionAr}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ── Card 2 — How to play / win & lose (neon mint) ──────────────────── */}
      <Panel
        icon="🎮"
        title="شرح طريقة اللعب والمكسب والخسارة"
        subtitle="مجرى الجولة، المراهنة، وكيف يُحسم الفائز"
        accent="primary"
        open={!!open.howto}
        onToggle={() => toggle("howto")}
      >
        <div className="flex flex-col gap-5 text-sm">
          <div>
            <h3 className="mb-2 font-extrabold text-primary">مجرى الجولة</h3>
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
                في كل دور تختار: <strong className="text-foreground">تمرير</strong> أو{" "}
                <strong className="text-foreground">مساواة</strong> الرهان،{" "}
                <strong className="text-foreground">رفع</strong> المبلغ،{" "}
                <strong className="text-foreground">كل الرصيد</strong>، أو{" "}
                <strong className="text-foreground">انسحاب</strong>. لديك{" "}
                <span className="num">60</span> ثانية لكل قرار.
              </Step>
              <Step n={4} title="الكشف">
                في النهاية يكوّن كل لاعب أقوى ترابط من بطاقاته حسب الجنسية والمركز والنادي — راجع
                «دليل الترابطات» في الأعلى.
              </Step>
            </ol>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="mb-2 flex items-center gap-1.5 font-extrabold text-primary">
                <span aria-hidden>🏆</span> كيف تفوز
              </h3>
              <ul className="flex list-disc flex-col gap-1.5 pe-4 text-muted-foreground">
                <li>صاحب الترابط الأقوى عند الكشف يكسب القِدر كاملًا ويُضاف إلى رصيدك.</li>
                <li>إذا انسحب كل المنافسين، تكسب القِدر تلقائيًا دون حاجة للكشف.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <h3 className="mb-2 flex items-center gap-1.5 font-extrabold text-destructive">
                <span aria-hidden>💔</span> كيف تخسر
              </h3>
              <ul className="flex list-disc flex-col gap-1.5 pe-4 text-muted-foreground">
                <li>إذا كان ترابطك أضعف عند الكشف، تخسر ما راهنت به في القِدر.</li>
                <li>عند الانسحاب تخسر نصف رهانك فقط (يبقى في القِدر) ويُعاد لك الباقي فورًا.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
            <h3 className="mb-1.5 flex items-center gap-1.5 font-extrabold text-gold">
              <span aria-hidden>🪙</span> معنى الكوين
            </h3>
            <p className="leading-relaxed text-muted-foreground">
              الكوين هو رصيد اللعب — تكسبه أو تخسره داخل الطاولة فقط. عند نفاده اطلب{" "}
              <span className="num">1000</span> كوين من البنك (حتى مرتين كل <span className="num">24</span>{" "}
              ساعة). لا بيع ولا شراء ولا تحويل.
            </p>
          </div>
        </div>
      </Panel>

      {/* ── Card 3 — Badges (cyan frame, gold badges) ─────────────────────── */}
      <Panel
        icon="🏅"
        title="شرح الشارات وكيفية الحصول عليها"
        subtitle="الشارات تُمنح تلقائيًا حسب أسلوب لعبك"
        accent="accent"
        open={!!open.badges}
        onToggle={() => toggle("badges")}
      >
        {badges.length > 0 ? (
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {badges.map((b) => (
              <li
                key={b.id}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/20 p-4"
              >
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-gold/15 text-2xl ring-1 ring-gold/30"
                >
                  {b.icon}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <strong className="font-bold text-foreground">{b.nameAr}</strong>
                  <span className="text-sm leading-snug text-muted-foreground">
                    {b.descriptionAr}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد شارات معرّفة حاليًا.</p>
        )}
      </Panel>
    </div>
  );
}
