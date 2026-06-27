import { HAND_RANK_CATALOG } from "@fb/shared";
import { LuHeader, LuScreen } from "@/components/games/lu-screen";
import { GuideIcon } from "@/components/games/lu-icons";
import { HowToPlay } from "@/app/guide/how-to-play";

/** PREVIEW ONLY — no auth/DB; real rank catalog + mock badges to judge the guide. */
export const dynamic = "force-static";

const ranks = [...HAND_RANK_CATALOG]
  .sort((a, b) => b.strength - a.strength)
  .map((h) => ({ code: h.code, nameAr: h.nameAr, nameEn: h.nameEn, descriptionAr: h.descriptionAr }));

const badges = [
  { id: "1", icon: "🃏", nameAr: "المخادع", descriptionAr: "نجحت في خداع خصومك مرّات كثيرة." },
  { id: "2", icon: "🍀", nameAr: "المحظوظ", descriptionAr: "فزت بأيدٍ ضعيفة." },
  { id: "3", icon: "🪨", nameAr: "الصخرة", descriptionAr: "لعب متحفّظ وثابت." },
];

export default function GuidePreview() {
  return (
    <LuScreen>
      <LuHeader icon={<GuideIcon size={22} />} title="كيف تلعب" subtitle="كل ما تحتاجه للبدء" />
      <p className="mb-4 mt-2 text-sm leading-relaxed text-[var(--lu-tan)]">اضغط أي بطاقة لعرض تفاصيلها.</p>
      <HowToPlay ranks={ranks} badges={badges} />
    </LuScreen>
  );
}
