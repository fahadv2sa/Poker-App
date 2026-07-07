"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GP_LIMITS, type GpDifficulty, type GpMode } from "@fb/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mirrors Top Ten's create-form: room name, MODE (this game's key knob),
// difficulty (VS_SYSTEM only), room type, players. Rounds are open-ended —
// the table keeps playing as long as players press "جولة جديدة". Deep-links into
// /play?create=1 where the socket creates the room and opens its lobby.
const MODE_OPTIONS: ReadonlyArray<{ value: GpMode; label: string; desc: string }> = [
  { value: "VS_SYSTEM", label: "ضد المنصة", desc: "المنصة تخفي لاعبًا عشوائيًا حسب المستوى" },
  { value: "VS_HUMANS", label: "ضد الأصدقاء", desc: "أحدكم ينتقي اللاعب الخفي، والبقية يخمّنون" },
];

const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: GpDifficulty; label: string; desc: string }> = [
  { value: "EASY", label: "سهل", desc: "لاعبون مشهورون" },
  { value: "MEDIUM", label: "متوسط", desc: "تحدٍّ متوازن" },
  { value: "HARD", label: "صعب", desc: "أسماء نادرة" },
];

const ROOM_TYPE_OPTIONS: ReadonlyArray<{ value: boolean; label: string; desc: string }> = [
  { value: false, label: "غرفة عامة", desc: "تظهر في قائمة الغرف ويمكن لأي لاعب الدخول" },
  { value: true, label: "غرفة خاصة", desc: "لا تظهر في القائمة — تُدخَل عبر رابط الدعوة أو الكود فقط" },
];

/** Owner setting: created rooms choose the round length; quick play stays 10. */
const ROUND_MINUTE_OPTIONS = [10, 15, 20] as const;
type RoundMinutes = (typeof ROUND_MINUTE_OPTIONS)[number];

const optionCls = (active: boolean) =>
  cn(
    "flex flex-col gap-0.5 rounded-xl border p-3 text-right transition",
    active
      ? "border-[var(--lu-gold-1)]/60 bg-[var(--lu-gold-2)]/10 shadow-[0_0_0_1px_rgb(var(--c-gold-1)/0.35)]"
      : "border-white/10 bg-black/20 hover:border-white/25",
  );

export function CreateRoomForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<GpMode>("VS_SYSTEM");
  const [isPrivate, setIsPrivate] = useState(false);
  const [difficulty, setDifficulty] = useState<GpDifficulty>("MEDIUM");
  const [roundMinutes, setRoundMinutes] = useState<RoundMinutes>(10);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const roomName = String(form.get("roomName") ?? "").trim();
    const maxPlayers = Number(form.get("maxPlayers") ?? GP_LIMITS.maxPlayers);
    const qs = new URLSearchParams({
      create: "1",
      mode,
      // One-time create id: a RELOAD of the resulting URL resyncs the same
      // room server-side; a fresh submit mints a new one → always a new lobby.
      n: Math.random().toString(36).slice(2, 10),
      private: isPrivate ? "1" : "0",
      max: String(maxPlayers),
      minutes: String(roundMinutes),
    });
    if (mode === "VS_SYSTEM") qs.set("difficulty", difficulty);
    if (roomName) qs.set("name", roomName);
    router.push(`/games/guess-player/play?${qs.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="roomName" className="text-[var(--lu-cream)]">اسم الغرفة</Label>
        <Input id="roomName" name="roomName" placeholder="طاولة المحققين" maxLength={40} />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-[var(--lu-cream)]">وضع اللعب</Label>
        <div className="grid grid-cols-2 gap-2">
          {MODE_OPTIONS.map((o) => {
            const active = mode === o.value;
            return (
              <button key={o.value} type="button" onClick={() => setMode(o.value)} aria-pressed={active} className={optionCls(active)}>
                <span className={cn("text-sm font-bold", active ? "text-[var(--lu-gold-1)]" : "text-[var(--lu-cream)]")}>{o.label}</span>
                <span className="text-[0.7rem] leading-snug text-[var(--lu-tan)]">{o.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {mode === "VS_SYSTEM" ? (
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
      ) : null}

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
        <Label className="text-[var(--lu-cream)]">مدة الجولة</Label>
        <div className="grid grid-cols-3 gap-2">
          {ROUND_MINUTE_OPTIONS.map((m) => {
            const active = roundMinutes === m;
            return (
              <button key={m} type="button" onClick={() => setRoundMinutes(m)} aria-pressed={active} className={optionCls(active)}>
                <span className={cn("num text-sm font-bold", active ? "text-[var(--lu-gold-1)]" : "text-[var(--lu-cream)]")}>{m} دقائق</span>
                <span className="text-[0.7rem] leading-snug text-[var(--lu-tan)]">{m === 10 ? "الإيقاع الاعتيادي" : m === 15 ? "وقت أطول للاستنتاج" : "جولة هادئة ومتأنية"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="maxPlayers" className="text-[var(--lu-cream)]">أقصى عدد لاعبين</Label>
        <Input id="maxPlayers" name="maxPlayers" type="number" min={GP_LIMITS.minPlayers} max={GP_LIMITS.maxPlayers} defaultValue={4} className="num" />
        <span className="text-[0.7rem] text-[var(--lu-tan)]">من ٢ إلى ٦ لاعبين.</span>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="btn-gold-cta w-full text-black">
        {pending ? "جارٍ الإنشاء…" : "إنشاء وفتح الطاولة"}
      </Button>
    </form>
  );
}
