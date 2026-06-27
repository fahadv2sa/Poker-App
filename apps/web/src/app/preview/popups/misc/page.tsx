"use client";

import { SoundControl } from "@/components/sound-control";
import { ConfirmButtons } from "@/components/confirm-buttons";

/**
 * PREVIEW ONLY — the smaller notifications/controls that are hard to trigger on
 * demand. Real components where safe (sound, confirm); stable static replicas
 * (exact reskinned markup) for the auto-dismissing toasts + the table summary,
 * so they stay visible for review.
 */
function Label({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-7 text-xs font-bold tracking-wide text-[var(--lu-tan)]">{children}</h2>;
}

export default function MiscPopupsPreview() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-md bg-[var(--lu-abyss)] px-5 py-8">
      <h1 className="lu-gold-text lu-gold-title text-2xl font-black">النوافذ والإشعارات</h1>
      <p className="mt-1 text-sm text-[var(--lu-tan)]">عرض ثابت لمراجعة التصميم.</p>

      <Label>إشعار «انتهت الغرفة» (توست)</Label>
      <div className="lu-frame inline-block rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-[var(--lu-ember-glow)] shadow-xl">
        انتهت هذه الغرفة
      </div>

      <Label>رسائل البنك (نجاح / خطأ)</Label>
      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-[var(--lu-gold-1)]/40 bg-[var(--lu-gold-2)]/10 px-3 py-2 text-sm text-[var(--lu-gold-1)]">
          تمت إضافة 6,000 كوين. رصيدك الآن 12,450.
        </div>
        <div className="rounded-md border border-[#d9694f]/40 bg-[#d9694f]/10 px-3 py-2 text-sm text-[#d9694f]">
          تعذّر تنفيذ الطلب
        </div>
      </div>

      <Label>تأكيد الإجراء (مغادرة الطاولة / الخروج)</Label>
      <ConfirmButtons confirmLabel="تأكيد المغادرة" onCancel={() => {}} />

      <Label>التحكّم بالصوت (مرّر فوقه لإظهار المؤشّر)</Label>
      <div className="flex">
        <SoundControl />
      </div>

      <Label>ملخّص الطاولة (الرأس + بطاقة جولة)</Label>
      <div className="flex flex-col gap-2">
        <div className="lu-frame flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="lu-gold-text lu-gold-title text-lg font-black">ملخص الطاولة</span>
            <span className="text-xs text-[var(--lu-tan)]">استعرض جولاتك — 3 جولات</span>
          </div>
          <span className="grid size-9 place-items-center rounded-full border border-[var(--lu-gold-1)]/25 bg-black/40 text-lg text-[var(--lu-cream)]/85">
            ✕
          </span>
        </div>
        <div className="lu-frame overflow-hidden rounded-2xl">
          <div className="flex w-full items-center gap-3 px-4 py-3">
            <span className="num grid size-8 place-items-center rounded-full border border-[var(--lu-gold-1)]/40 bg-[var(--lu-gold-2)]/10 text-xs font-black text-[var(--lu-gold-1)]">
              3
            </span>
            <span className="flex-1 text-sm font-bold text-[var(--lu-cream)]">الجولة 3</span>
            <span className="text-[var(--lu-tan)]">▾</span>
          </div>
        </div>
        <p className="text-[0.7rem] text-[var(--lu-tan)]">
          (عند الفتح تظهر إعلان الفائز الذهبي نفسه الظاهر في الطاولة.)
        </p>
      </div>
    </main>
  );
}
