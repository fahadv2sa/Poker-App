import { redirect } from "next/navigation";
import { GuideIcon } from "@fb/top-10-ui";
import { auth } from "@/auth";
import { LuHeader, LuPanel, LuScreen } from "@/components/guess-player/lu-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "دليل اللعب — خمن اللاعب" };

const SECTIONS: ReadonlyArray<{ icon: string; title: string; lines: string[] }> = [
  {
    icon: "🕵️",
    title: "الفكرة",
    lines: [
      "لاعب كرة قدم خفي يُختار من قاعدة اللاعبين.",
      "تتناوبون على طرح أسئلة نعم/لا لاكتشاف هويته — والمنصة (وليس أي لاعب) تجيب من بياناتها الحقيقية.",
      "أول من يخمّنه بشكل صحيح يفوز بالجولة.",
    ],
  },
  {
    icon: "⏱",
    title: "الأدوار والوقت",
    lines: [
      "في دورك (٣٠ ثانية): إمّا سؤال واحد أو تخمين واحد.",
      "الجولة ١٠ دقائق كحد أقصى — إن انتهت دون تخمين صحيح يُكشف اللاعب بلا فائز.",
      "لكل لاعب ٣ محاولات تخمين في الجولة؛ التخمين الخاطئ يستهلك محاولة (ويبقى بإمكانك السؤال).",
      "إجابة «لا يمكن الإجابة» لا تستهلك دورك — اسأل سؤالًا آخر.",
    ],
  },
  {
    icon: "❓",
    title: "ماذا تسأل؟",
    lines: [
      "الأندية: هل لعب في نادٍ معيّن؟ وفي موسم محدد؟",
      "الجنسية والمنتخب الوطني.",
      "البطولات: هل لعب في دوري/بطولة معيّنة؟ وفي موسم محدد؟",
      "الألقاب: هل فاز بلقب معيّن؟ في أي موسم؟ ومع أي نادٍ؟",
      "تُبنى الأسئلة بالاختيار من قوائم حقيقية — لا كتابة حرة، فلا لبس ولا خطأ.",
    ],
  },
  {
    icon: "🎮",
    title: "وضعا اللعب",
    lines: [
      "ضد المنصة: المنصة تخفي لاعبًا حسب المستوى (سهل/متوسط/صعب). اللعب السريع دائمًا بهذا الوضع، ويصلح فرديًا.",
      "ضد الأصدقاء (الغرف فقط): أحدكم «المنتقي» يختار اللاعب الخفي من كل القاعدة — لا يسأل ولا يخمّن، والمنصة تجيب.",
      "من يخمّن صحيحًا يصبح المنتقي في الجولة التالية؛ وإن انتهى الوقت يبقى المنتقي نفسه وينال نقاط صمود.",
    ],
  },
  {
    icon: "⭐",
    title: "النقاط",
    lines: [
      "كلما أسرعت في الكشف زادت نقاطك (حتى ٥٠٠ نقطة أساس).",
      "ضد المنصة تُضاعف النقاط حسب المستوى: متوسط ×١٫٢٥ وصعب ×١٫٥.",
      "في وضع الأصدقاء: المنتقي ينال ٢٥٪ من نقاط الكاشف، أو ١٥٠ نقطة صمود إن لم يُكشف لاعبه.",
      "المباراة عدة جولات (٣ افتراضيًا) — الأعلى نقاطًا يفوز.",
    ],
  },
];

export default async function GuidePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <LuScreen>
      <LuHeader icon={<GuideIcon size={22} />} title="دليل اللعب" subtitle="كيف تلعب خمن اللاعب" />
      <div className="mt-3 flex flex-col gap-3">
        {SECTIONS.map((s) => (
          <LuPanel key={s.title}>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-black text-[var(--lu-gold-1)]">
              <span aria-hidden>{s.icon}</span> {s.title}
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pr-5 text-sm leading-relaxed text-[var(--lu-cream)]/90">
              {s.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </LuPanel>
        ))}
      </div>
    </LuScreen>
  );
}
