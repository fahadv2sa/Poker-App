import Link from "next/link";

/** PREVIEW ONLY — index of the popup/notification previews. */
export const dynamic = "force-static";

const items: Array<[string, string, string]> = [
  ["نافذة ترقية المستوى", "/preview/popups/level-up", "تظهر تلقائيًا"],
  ["نافذة مكافأة التثبيت", "/preview/popups/install", "تظهر بعد ~1.2 ثانية"],
  ["التوستات + التحكّم + ملخّص الطاولة", "/preview/popups/misc", "عرض ثابت"],
];

export default function PopupsIndex() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-md bg-[var(--lu-abyss)] px-5 py-8">
      <h1 className="lu-gold-text lu-gold-title text-2xl font-black">معاينة النوافذ المنبثقة</h1>
      <div className="mt-5 flex flex-col gap-2">
        {items.map(([label, href, note]) => (
          <Link
            key={href}
            href={href}
            className="lu-frame lu-btn flex items-center justify-between rounded-2xl px-4 py-3.5"
          >
            <span className="font-bold text-[var(--lu-cream)]">{label}</span>
            <span className="text-[0.7rem] text-[var(--lu-tan)]">{note} →</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
