"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Difficulty } from "@fb/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: Difficulty; label: string; desc: string }> = [
  { value: "EASY", label: "سهل", desc: "اللاعبون بتقييم 70 إلى 100" },
  { value: "MEDIUM", label: "متوسط", desc: "اللاعبون بتقييم 50 إلى 100" },
  { value: "ELITE", label: "النخبة", desc: "جميع اللاعبين" },
];

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

/** Create-room form. POSTs to /api/rooms, then opens the new table. */
export function CreateRoomForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: String(form.get("roomName") ?? ""),
          isPrivate,
          maxPlayers: Number(form.get("maxPlayers") ?? 6),
          difficulty,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.messageAr ?? "تعذّر إنشاء الغرفة");
        return;
      }
      router.push(`/table/${data.id}`);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-[#d9694f]/40 bg-[#d9694f]/10 px-3 py-2 text-sm text-[#d9694f]">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="roomName" className="text-[var(--lu-cream)]">اسم الغرفة</Label>
        <Input id="roomName" name="roomName" placeholder="طاولة الأبطال" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-[var(--lu-cream)]">مستوى الصعوبة</Label>
        <div className="grid grid-cols-2 gap-2">
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
        <Label className="text-[var(--lu-cream)]">نوع الغرفة</Label>
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
        <Label htmlFor="maxPlayers" className="text-[var(--lu-cream)]">أقصى عدد لاعبين</Label>
        <Input id="maxPlayers" name="maxPlayers" type="number" min={2} max={8} defaultValue={6} className="num" />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="btn-gold-cta w-full text-black">
        {pending ? "جارٍ الإنشاء…" : "إنشاء وفتح الطاولة"}
      </Button>
    </form>
  );
}
