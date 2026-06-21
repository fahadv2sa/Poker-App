"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QUICK_PLAY, type Difficulty } from "@fp/shared";
import { connectQueue, type QueueConnection } from "@/lib/realtime";
import { sound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    // Unlock + preload audio on THIS user gesture. Quick Play then navigates
    // straight into a (bot) table the player may just watch without clicking, so
    // this is the last guaranteed gesture before sounds must fire — the browser
    // autoplay policy needs the AudioContext resumed inside a real gesture, else
    // the table's sound hooks stay silent. (The sound manager is a module
    // singleton, so the unlock persists across the client-side navigation.)
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
      <Card className="panel overflow-hidden p-0">
        <div
          className="flex flex-col items-center gap-3 px-6 py-8 text-center"
          style={{
            background:
              "radial-gradient(120% 90% at 50% -10%, color-mix(in oklch, var(--accent) 18%, transparent), transparent 60%)",
          }}
        >
          <span className="text-sm tracking-[0.2em] text-accent/80">لعب سريع · {TIERS.find((x) => x.value === tier)?.label}</span>
          <span className="num text-5xl font-black">
            {count}
            <span className="text-2xl text-muted-foreground"> / {max}</span>
          </span>
          <span className="text-sm text-muted-foreground">
            {ready ? "اكتمل العدد الأدنى — تبدأ المباراة قريبًا" : `بانتظار ${min} لاعبين على الأقل…`}
          </span>

          {/* seat dots */}
          <div className="mt-1 flex items-center justify-center gap-2">
            {Array.from({ length: max }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-3 rounded-full transition",
                  i < count ? "bg-primary glow-primary" : "bg-white/12",
                )}
              />
            ))}
          </div>

          {secs != null ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1 text-gold">
              تبدأ خلال <span className="num text-lg font-black">{secs}</span> ثانية
            </div>
          ) : (
            <div className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 animate-ping rounded-full bg-accent" /> جارٍ البحث عن لاعبين…
            </div>
          )}
        </div>
        <div className="border-t border-border/60 p-4">
          <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={leave}>
            مغادرة الطابور
          </Button>
        </div>
      </Card>
    );
  }

  // ── Tier selection ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
          {error}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        اختر المستوى وانضمّ إلى الطابور — تبدأ المباراة تلقائيًا عند اكتمال {QUICK_PLAY.minPlayers} لاعبين.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {TIERS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => joinTier(t.value)}
            className="tile flex flex-col gap-1 p-5 text-right"
          >
            <span className="text-lg font-black">{t.label}</span>
            <span className="text-xs text-muted-foreground">{t.desc}</span>
            <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs text-gold">
              رهان الدخول 🪙 <span className="num font-bold">{QUICK_PLAY.entryByTier[t.value]}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
