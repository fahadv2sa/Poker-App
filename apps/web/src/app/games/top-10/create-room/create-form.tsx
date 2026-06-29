"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@fb/top-10-ui";
import { type TtDifficulty } from "@fb/shared";

// Mirrors Link Up's create-form option styling (optionCls) + btn-gold-cta button.
const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: TtDifficulty; label: string; desc: string }> = [
  { value: "EASY", label: "سهل", desc: "لاعبون مشهورون" },
  { value: "MEDIUM", label: "متوسط", desc: "تحدٍّ متوازن" },
  { value: "HARD", label: "صعب", desc: "أسماء نادرة" },
];

// Mirrors Link Up's room-type toggle (نوع الغرفة) verbatim — same copy + styling.
const ROOM_TYPE_OPTIONS: ReadonlyArray<{ value: boolean; label: string; desc: string }> = [
  { value: false, label: "غرفة عامة", desc: "تظهر في قائمة الغرف ويمكن لأي لاعب الدخول" },
  { value: true, label: "غرفة خاصة", desc: "لا تظهر في القائمة — تُدخَل عبر رابط الدعوة أو الكود فقط" },
];

const optionCls = (active: boolean) =>
  cn(
    "flex flex-col gap-0.5 rounded-xl border p-3 text-right transition",
    active
      ? "border-[var(--lu-gold-1)]/60 bg-[var(--lu-gold-2)]/10 shadow-[0_0_0_1px_rgba(242,210,122,0.35)]"
      : "border-white/10 bg-black/20 hover:border-white/25",
  );

const labelCls = "flex items-center gap-2 text-sm leading-none font-medium text-[var(--lu-cream)]";
const inputCls =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none num text-[var(--lu-cream)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

export function CreateRoomForm() {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<TtDifficulty>("MEDIUM");
  const [isPrivate, setIsPrivate] = useState(false);
  const [minutes, setMinutes] = useState(10);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/games/top-10/play?create=1&difficulty=${difficulty}&minutes=${minutes}&private=${isPrivate ? 1 : 0}`);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <span className={labelCls}>مستوى الصعوبة</span>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTY_OPTIONS.map((o) => {
            const active = difficulty === o.value;
            return (
              <button key={o.value} type="button" onClick={() => setDifficulty(o.value)} aria-pressed={active} className={optionCls(active)}>
                <span className={cn("text-sm font-bold", active ? "text-[var(--lu-gold-1)]" : "text-[var(--lu-cream)]")}>{o.label}</span>
                <span className="text-[0.7rem] leading-snug text-[var(--lu-tan)]">{o.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={labelCls}>نوع الغرفة</span>
        <div className="grid grid-cols-2 gap-2">
          {ROOM_TYPE_OPTIONS.map((o) => {
            const active = isPrivate === o.value;
            return (
              <button key={String(o.value)} type="button" onClick={() => setIsPrivate(o.value)} aria-pressed={active} className={optionCls(active)}>
                <span className={cn("text-sm font-bold", active ? "text-[var(--lu-gold-1)]" : "text-[var(--lu-cream)]")}>{o.label}</span>
                <span className="text-[0.7rem] leading-snug text-[var(--lu-tan)]">{o.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="minutes" className={labelCls}>
          مدة الجولة (دقائق)
        </label>
        <input
          id="minutes"
          type="number"
          min={1}
          max={30}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className={inputCls}
        />
        <span className="text-[0.7rem] text-[var(--lu-tan)]">٣ جولات لكل مباراة · حتى ٤ لاعبين · بدون بوتات.</span>
      </div>

      <button type="submit" className="btn-gold-cta inline-flex h-10 w-full items-center justify-center rounded-md px-6 text-sm font-bold text-black">
        إنشاء وفتح الغرفة
      </button>
    </form>
  );
}
