"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QUICK_PLAY, type Difficulty } from "@fb/shared";
import { connectQueue, type QueueConnection } from "@/lib/realtime";
import { sound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIERS: ReadonlyArray<{ value: Difficulty; label: string; desc: string }> = [
  { value: "EASY", label: "سهل", desc: "اللاعبون بتقييم 70 إلى 100" },
  { value: "MEDIUM", label: "متوسط", desc: "اللاعبون بتقييم 50 إلى 100" },
  { value: "ELITE", label: "النخبة", desc: "جميع اللاعبين" },
];

interface QState {
  count: number;
  min: number;
  max: number;
  deadlineTs: number | null;
}

/** Quick Play: pick a tier, join its server-side queue, watch the waiting lobby
 *  fill + count down, then get sent into the auto-created table. Leaving is
 *  clean (no charge — nothing is deducted until the table deals). */
export function QuickPlay({ token }: { token: string }) {
  const router = useRouter();
  const connRef = useRef<QueueConnection | null>(null);
  const [tier, setTier] = useState<Difficulty | null>(null);
  const [state, setState] = useState<QState | null>(null);
  const [secs, setSecs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local countdown from the server-provided deadline.
  useEffect(() => {
    const dl = state?.deadlineTs ?? null;
    if (dl == null) {
      setSecs(null);
      return;
    }
    const tick = () => setSecs(Math.max(0, Math.ceil((dl - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [state?.deadlineTs]);

  useEffect(() => () => connRef.current?.disconnect(), []);

  function leave() {
    connRef.current?.leaveQueue();
    connRef.current?.disconnect();
    connRef.current = null;
    setTier(null);
    setState(null);
    setSecs(null);
  }

  function joinTier(t: Difficulty) {
    sound.unlock();
    void sound.preload();
    setError(null);
    setTier(t);
    setState(null);
    const conn = connectQueue(token, {
      onConnect: () => conn.joinQueue(t),
      onState: (p) => setState({ count: p.count, min: p.min, max: p.max, deadlineTs: p.deadlineTs }),
      onMatched: (p) => {
        conn.disconnect();
        connRef.current = null;
        router.push(`/table/${p.gameId}`);
      },
      onError: (e) => {
        setError(e.messageAr);
        leave();
      },
    });
    connRef.current = conn;
  }

  // ── Waiting lobby ─────────────────────────────────────────────────────────
  if (tier) {
    const count = state?.count ?? 0;
    const min = state?.min ?? QUICK_PLAY.minPlayers;
    const max = state?.max ?? QUICK_PLAY.maxSeats;
    const ready = count >= min;
    return (
      <div className="lu-frame overflow-hidden rounded-3xl">
        <div
          className="flex flex-col items-center gap-3 px-6 py-8 text-center"
          style={{ background: "radial-gradient(120% 90% at 50% -10%, rgb(var(--c-ember)/0.16), transparent 60%)" }}
        >
          <span className="text-sm tracking-[0.2em] text-[var(--lu-gold-1)]/80">
            لعب سريع · {TIERS.find((x) => x.value === tier)?.label}
          </span>
          <span className="num text-5xl font-black text-[var(--lu-cream)]">
            {count}
            <span className="text-2xl text-[var(--lu-tan)]"> / {max}</span>
          </span>
          <span className="text-sm text-[var(--lu-tan)]">
            {ready ? "اكتمل العدد الأدنى — تبدأ المباراة قريبًا" : `بانتظار ${min} لاعبين على الأقل…`}
          </span>

          {/* seat dots */}
          <div className="mt-1 flex items-center justify-center gap-2">
            {Array.from({ length: max }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-3 rounded-full transition",
                  i < count
                    ? "bg-[var(--lu-ember)] shadow-[0_0_10px_rgb(var(--c-ember)/0.6)]"
                    : "bg-white/12",
                )}
              />
            ))}
          </div>

          {secs != null ? (
            <div className="lu-chip mt-2 inline-flex items-center gap-2 rounded-full px-4 py-1 text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/40">
              تبدأ خلال <span className="num text-lg font-black">{secs}</span> ثانية
            </div>
          ) : (
            <div className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--lu-tan)]">
              <span className="size-2 animate-ping rounded-full bg-[var(--lu-ember)]" /> جارٍ البحث عن لاعبين…
            </div>
          )}
        </div>
        <div className="border-t border-white/10 p-4">
          <Button variant="ghost" className="w-full text-[var(--fb-danger)] hover:text-[var(--fb-danger)]" onClick={leave}>
            مغادرة الطابور
          </Button>
        </div>
      </div>
    );
  }

  // ── Tier selection ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-[var(--fb-danger)]/40 bg-[var(--fb-danger)]/10 px-3 py-2 text-sm text-[var(--fb-danger)]">
          {error}
        </div>
      ) : null}
      <p className="text-sm text-[var(--lu-tan)]">
        اختر المستوى وانضمّ إلى الطابور — تبدأ المباراة تلقائيًا عند اكتمال {QUICK_PLAY.minPlayers} لاعبين.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {TIERS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => joinTier(t.value)}
            className="lu-btn lu-frame flex flex-col gap-1 rounded-2xl p-5 text-right"
          >
            <span className="text-lg font-black text-[var(--lu-cream)]">{t.label}</span>
            <span className="text-xs text-[var(--lu-tan)]">{t.desc}</span>
            <span className="lu-chip mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/40">
              رهان الدخول 🪙 <span className="num font-bold">{QUICK_PLAY.entryByTier[t.value]}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
