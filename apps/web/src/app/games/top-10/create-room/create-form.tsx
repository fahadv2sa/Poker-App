"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type TtDifficulty } from "@fb/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mirrors Link Up's create-form (look + inputs): room name, difficulty, room type,
// max players — plus Top Ten's own round-duration knob. Instead of a REST POST it
// deep-links into /play?create=1, where the socket creates the room and opens its lobby.
const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: TtDifficulty; label: string; desc: string }> = [
  { value: "EASY", label: "سهل", desc: "لاعبون مشهورون" },
  { value: "MEDIUM", label: "متوسط", desc: "تحدٍّ متوازن" },
  { value: "HARD", label: "صعب", desc: "أسماء نادرة" },
];

const ROOM_TYPE_OPTIONS: ReadonlyArray<{ value: boolean; label: string; desc: string }> = [
  { value: false, label: "غرفة عامة", desc: "تظهر في قائمة الغرف ويمكن لأي لاعب الدخول" },
  { value: true, label: "غرفة خاصة", desc: "لا تظهر في القائمة — تُدخَل عبر رابط الدعوة أو الكود فقط" },
];

const optionCls = (active: boolean) =>
  cn(
    "flex flex-col gap-0.5 rounded-xl border p-3 text-right transition",
    active
      ? "border-[var(--lu-gold-1)]/60 bg-[var(--lu-gold-2)]/10 shadow-[0_0_0_1px_rgb(var(--c-gold-1)/0.35)]"
      : "border-white/10 bg-black/20 hover:border-white/25",
  );

/** Create-room form. Deep-links into the play surface, which creates the room
 *  over the socket and opens its lobby (invite card + share). */
export function CreateRoomForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [difficulty, setDifficulty] = useState<TtDifficulty>("MEDIUM");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const roomName = String(form.get("roomName") ?? "").trim();
    const maxPlayers = Number(form.get("maxPlayers") ?? 4);
    const minutes = Number(form.get("minutes") ?? 10);
    const qs = new URLSearchParams({
      create: "1",
      difficulty,
      minutes: String(minutes),
      // One-time create id: a RELOAD of the resulting URL resyncs the same
      // room server-side; a fresh submit mints a new one → always a new lobby.
      n: Math.random().toString(36).slice(2, 10),
      private: isPrivate ? "1" : "0",
      max: String(maxPlayers),
    });
    if (roomName) qs.set("name", roomName);
    router.push(`/games/top-10/play?${qs.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="roomName" className="text-[var(--lu-cream)]">اسم الغرفة</Label>
        <Input id="roomName" name="roomName" placeholder="طاولة الأبطال" maxLength={40} />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-[var(--lu-cream)]">مستوى الصعوبة</Label>
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
        <Input id="maxPlayers" name="maxPlayers" type="number" min={2} max={4} defaultValue={4} className="num" />
        <span className="text-[0.7rem] text-[var(--lu-tan)]">من ٢ إلى ٤ لاعبين.</span>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="minutes" className="text-[var(--lu-cream)]">مدة الجولة (دقائق)</Label>
        <Input id="minutes" name="minutes" type="number" min={1} max={30} defaultValue={10} className="num" />
        <span className="text-[0.7rem] text-[var(--lu-tan)]">٣ جولات لكل مباراة.</span>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="btn-gold-cta w-full text-black">
        {pending ? "جارٍ الإنشاء…" : "إنشاء وفتح الطاولة"}
      </Button>
    </form>
  );
}
