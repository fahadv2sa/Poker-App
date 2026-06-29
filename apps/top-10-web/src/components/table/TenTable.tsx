"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@fb/top-10-ui";
import { TT_HINT, type TtCardView, type TtRevealEvent, type TtStateView } from "@fb/shared";
import { PlayerSearch } from "../PlayerSearch";
import { TenCard } from "./TenCard";
import { TenSeat } from "./TenSeat";
import { TenHud } from "./TenHud";
import { TenRevealNotice, type RevealDisplay } from "./TenRevealNotice";
import { TenHintOverlay } from "./TenHintOverlay";

const DIFF_AR: Record<string, string> = { EASY: "سهل", MEDIUM: "متوسط", HARD: "صعب" };

/**
 * Top Ten LIVE TABLE (presentational). Consumes a TtStateView-shaped model so the live
 * client can pass real socket state later (P3) with zero rework; the preview passes mock
 * state. The felt fills the space between the pinned header/seats and the docked
 * search/HUD; the 10-card grid is HEIGHT-DRIVEN (grid-rows-5 = equal 1fr rows inside a
 * min-h-0 felt) so all 10 cards + everything else fit ANY phone with no scroll.
 */
export function TenTable({
  state,
  meId,
  nickname,
  onPick,
  onLeave,
  reveal = null,
}: {
  state: TtStateView;
  meId: string;
  nickname: string;
  onPick: (playerId: string) => void;
  onLeave?: () => void;
  /** Latest correct-guess event (with a monotonic id) → drives the big reveal notice.
   *  The live client bumps `id` per tt:reveal; the preview simulates it. */
  reveal?: { event: TtRevealEvent; id: number } | null;
}) {
  const me = useMemo(() => state.seats.find((s) => s.userId === meId), [state.seats, meId]);
  const opponents = useMemo(() => state.seats.filter((s) => s.userId !== meId), [state.seats, meId]);
  const turnTotalMs = state.roundTimerSec ? Math.min(state.roundTimerSec, 30) * 1000 : 30_000;

  const isMyTurn = state.mode === "NORMAL" && me != null && state.turnSeat === me.seat;
  const hintOpen = state.mode === "HINT" && state.hint?.phase === "OPEN";
  const canGuess = (isMyTurn || (hintOpen && !me?.locked)) && me?.status === "ACTIVE";

  const revealed = state.cards.filter((c) => c.revealed).length;
  const claimedBySeat = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of state.cards) if (c.revealed && c.bySeat != null) m.set(c.bySeat, (m.get(c.bySeat) ?? 0) + 1);
    return m;
  }, [state.cards]);

  // RTL row-major fill → right column ranks 1-5, left column ranks 6-10.
  const byRank = useMemo(() => {
    const m = new Map<number, TtCardView>();
    for (const c of state.cards) m.set(c.rank, c);
    const ordered: TtCardView[] = [];
    for (let r = 1; r <= 5; r++) {
      if (m.get(r)) ordered.push(m.get(r)!);
      if (m.get(r + 5)) ordered.push(m.get(r + 5)!);
    }
    return ordered;
  }, [state.cards]);

  const hint = state.mode === "HINT";

  // resolve the raw reveal event → a display-ready notice payload (contestant name).
  const revealDisplay: RevealDisplay | null = useMemo(() => {
    if (!reveal) return null;
    const ev = reveal.event;
    const by = ev.bySeat != null ? state.seats.find((s) => s.seat === ev.bySeat) : undefined;
    return {
      id: reveal.id,
      byName: by?.username ?? null,
      isMe: by?.userId === meId,
      playerNameAr: ev.player.nameAr,
      rank: ev.rank,
      points: ev.points,
      photoUrl: ev.player.photoUrl,
    };
  }, [reveal, state.seats, meId]);

  // shake the search bar when MY wrong-attempt count rises (hint mode feedback).
  const [shakeKey, setShakeKey] = useState(0);
  const prevWrong = useRef(me?.wrongAttempts ?? 0);
  useEffect(() => {
    const w = me?.wrongAttempts ?? 0;
    if (w > prevWrong.current) setShakeKey((k) => k + 1);
    prevWrong.current = w;
  }, [me?.wrongAttempts]);

  return (
    <main
      className="mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-[var(--lu-abyss)] px-2"
      style={{ paddingTop: "max(0.45rem, env(safe-area-inset-top))", paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))" }}
    >
      {/* header — minimal: round + difficulty, leave */}
      <header className="flex shrink-0 items-center justify-between gap-2 pb-1">
        <span className="num rounded-full border border-[var(--lu-gold-1)]/25 bg-black/40 px-2.5 py-0.5 text-[0.7rem] font-bold text-[var(--lu-tan)]">
          الجولة {state.roundNo}/{state.roundsTotal} · {DIFF_AR[state.difficulty] ?? state.difficulty}
        </span>
        {onLeave ? (
          <button onClick={onLeave} className="lu-btn rounded-lg px-3 py-1 text-xs font-bold text-[#d9694f]">
            خروج
          </button>
        ) : null}
      </header>

      {/* opponent arc — overlaps the felt rim */}
      <div className="relative z-10 -mb-3 flex shrink-0 flex-nowrap items-end justify-center gap-1.5 px-1">
        {opponents.length === 0 ? (
          <span className="mb-3 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[0.7rem] text-white/50">بانتظار لاعبين…</span>
        ) : (
          opponents.map((s, i) => {
            const offset = Math.round(Math.abs(i - (opponents.length - 1) / 2) * 5);
            return (
              <div key={s.seat} style={{ transform: `translateY(${offset}px)` }}>
                <TenSeat
                  seat={s}
                  isActive={state.mode === "NORMAL" && state.turnSeat === s.seat}
                  deadlineTs={state.deadlineTs}
                  claimed={claimedBySeat.get(s.seat) ?? 0}
                  turnTotalMs={turnTotalMs}
                />
              </div>
            );
          })
        )}
      </div>

      {/* felt: banner crown + the 10-card grid */}
      <section
        className={cn(
          "lu-felt relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border px-2 pb-2 pt-3 transition-colors",
          hint ? "border-[var(--lu-ember)]/60" : "border-[var(--lu-gold-1)]/20",
        )}
      >
        {/* warm floodlight rim */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16" style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(255,106,26,0.16), transparent)" }} />

        {/* banner crown — the question (our honest scope title) + progress */}
        <div className="relative z-10 shrink-0 px-1 pb-1.5 text-center">
          <div className="lu-gold-text lu-gold-title truncate text-[clamp(0.92rem,4.4vw,1.18rem)] font-black leading-tight">
            {state.question?.titleAr ?? "—"}
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-2 text-[clamp(0.6rem,2.8vw,0.74rem)] text-[var(--lu-tan)]">
            <span className="truncate">{state.question?.competitionAr}</span>
            <span aria-hidden>·</span>
            <span className="num shrink-0">كُشِف {revealed}/10</span>
          </div>
          {/* progress bar */}
          <div className="mx-auto mt-1 h-1 w-2/3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-linear-to-l from-[var(--lu-gold-1)] to-[var(--lu-ember)] transition-[width] duration-300" style={{ width: `${revealed * 10}%` }} />
          </div>
        </div>

        {/* the 10 rank cards — 2 cols × 5 rows, equal 1fr rows fill the felt */}
        <div className="relative z-10 grid min-h-0 flex-1 grid-cols-2 grid-rows-5 gap-1.5 pt-1">
          {byRank.map((c) => (
            <TenCard key={c.rank} card={c} metricType={state.question?.type} hintMode={hint} />
          ))}
        </div>

        {/* hint-mode theatre (start flash · circular countdown · hint text) */}
        <TenHintOverlay mode={state.mode} hint={state.hint} deadlineTs={state.deadlineTs} />
      </section>

      {/* search dock — the action bar (results float UP over the felt) */}
      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
        transition={{ duration: 0.4 }}
        className="mt-1.5 shrink-0"
      >
        <PlayerSearch
          disabled={!canGuess}
          onPick={onPick}
          openUp
          placeholder={
            canGuess
              ? hintOpen
                ? "الأسرع يفوز — اكتب الآن!"
                : "دورك — اكتب اسم لاعب من القائمة…"
              : me?.locked
                ? "نَفِدت محاولاتك هذه الجولة"
                : hint
                  ? "وضع التلميح…"
                  : "ليس دورك الآن…"
          }
        />
      </motion.div>

      {/* my account HUD */}
      <div className="mt-1.5 shrink-0">
        {me ? (
          <TenHud
            me={me}
            nickname={nickname}
            isMyTurn={isMyTurn}
            deadlineTs={state.deadlineTs}
            turnTotalMs={turnTotalMs}
            hint={hint}
            maxAttempts={TT_HINT.wrongAttemptsPerPlayer}
          />
        ) : null}
      </div>

      {/* big correct-guess notice (center stage) */}
      <TenRevealNotice latest={revealDisplay} />
    </main>
  );
}
