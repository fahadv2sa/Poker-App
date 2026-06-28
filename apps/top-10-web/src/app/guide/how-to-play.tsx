"use client";
import { useState } from "react";
import { cn } from "@fb/top-10-ui";

const CARDS: { icon: string; title: string; body: string[] }[] = [
  {
    icon: "🎯",
    title: "الفكرة",
    body: [
      "كل جولة قائمة «توب 10» لإحصائية كروية (مثل: أكثر 10 لاعبين تسجيلاً للأهداف في الدوري الإسباني 2022).",
      "النظام يعرف اللاعبين العشرة وترتيبهم، وعليك تخمينهم بكتابة أسمائهم.",
    ],
  },
  {
    icon: "🏆",
    title: "النقاط",
    body: [
      "النقاط = مركز اللاعب: الأول نقطة واحدة، والعاشر 10 نقاط.",
      "الذكاء أن تصطاد الأقل شهرةً في أسفل القائمة لأنهم الأثمن.",
    ],
  },
  {
    icon: "🔄",
    title: "وضع الأدوار",
    body: [
      "اللعب بالأدوار بالتناوب، ولكل لاعب 30 ثانية.",
      "ينتقل الدور بمجرد إرسال تخمين — صحيحًا كان أم خاطئًا. التخمين الخاطئ يُنهي دورك فورًا.",
      "اختيار لاعب مكشوف مسبقًا لا يُحتسب خطأ ولا يُنهي دورك.",
    ],
  },
  {
    icon: "💡",
    title: "وضع التلميح",
    body: [
      "بعد جولتين كاملتين دون أي إجابة صحيحة يتحول اللعب إلى «الأسرع يفوز».",
      "عدّ تنازلي من 10، ثم تلميح عن بطاقة محددة، ثم 30 ثانية للجميع — الأسرع بالإجابة الصحيحة يكسب البطاقة.",
      "لكل لاعب 3 محاولات خاطئة فقط في هذا الوضع.",
    ],
  },
  {
    icon: "🥇",
    title: "المباراة",
    body: [
      "المباراة 3 جولات ثابتة، وتتراكم النقاط. الفائز صاحب أعلى مجموع.",
      "عند تعادل النقاط يفوز من كشف اللاعبين الأثمن (الأعلى مركزًا).",
      "الانسحاب قبل اكتمال المباراة يفقدك كل نقاطك ويُسجَّل «منسحب».",
    ],
  },
];

export function HowToPlay() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="flex flex-col gap-3">
      {CARDS.map((c, i) => {
        const isOpen = open === i;
        return (
          <section key={c.title} className="lu-frame overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-right"
            >
              <span className="lu-chip grid size-9 shrink-0 place-items-center rounded-xl text-lg ring-1 ring-[var(--lu-gold-1)]/30">
                {c.icon}
              </span>
              <span className="flex-1 font-bold lu-gold-text">{c.title}</span>
              <span className={cn("text-[var(--lu-tan)] transition-transform", isOpen && "rotate-180")} aria-hidden>
                ▾
              </span>
            </button>
            {isOpen ? (
              <ul className="flex list-disc flex-col gap-1.5 px-6 pb-4 pe-9 text-sm leading-relaxed text-[var(--lu-tan)]">
                {c.body.map((line, j) => (
                  <li key={j}>{line}</li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
