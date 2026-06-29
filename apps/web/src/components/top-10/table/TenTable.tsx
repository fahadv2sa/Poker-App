"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import { cn } from "@fb/top-10-ui";
import { FlyProvider } from "@fb/table-ui";
import { TT_HINT, TT_TIMING, type TtCardView, type TtRevealEvent, type TtStateView } from "@fb/shared";
import { PlayerSearch } from "../PlayerSearch";
import { ttSound } from "@/lib/top-10/sound";
import { TT_ANIMATIONS_ENABLED } from "@/lib/top-10/anim";
import { TenCard } from "./TenCard";
import { TenSeat } from "./TenSeat";
import { TenHud } from "./TenHud";
import { TenRevealNotice, type RevealDisplay } from "./TenRevealNotice";
import { TenHintOverlay } from "./TenHintOverlay";
import { TenEffects } from "./TenEffects";
import { TenStandings } from "./TenStandings";
import { TenCoachmark } from "./TenCoachmark";

const DIFF_AR: Record<string, string> = { EASY: "سهل", MEDIUM: "متوسط", HARD: "صعب" };

/** Header sound toggle — matches Link Up's SoundControl button (round, gold border,
 *  speaker glyph). Clicking also unlocks the audio context (a user gesture). */
function SoundButton() {
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(ttSound.muted), []);
  return (
    <button
      type="button"
      aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
      aria-pressed={muted}
      onClick={() => { ttSound.unlock(); setMuted(ttSound.toggle()); }}
      className="grid size-8 place-items-center rounded-full border border-[var(--lu-gold-1)]/25 bg-[#0b0908]/70 text-[var(--lu-cream)]/80 transition hover:border-[var(--lu-gold-1)]/45 hover:text-[var(--lu-cream)]"
    >
      {muted ? <IconMuted /> : <IconSound />}
    </button>
  );
}
function IconSound() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}
function IconMuted() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}

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
  onClose,
  reveal = null,
  onRequestEndRound,
  onVoteEndRound,
}: {
  state: TtStateView;
  meId: string;
  nickname: string;
  onPick: (playerId: string) => void;
  onLeave?: () => void;
  /** Creator-only: close the table for everyone (mirrors Link Up's host close). */
  onClose?: () => void;
  /** Latest correct-guess event (with a monotonic id) → drives the big reveal notice.
   *  The live client bumps `id` per tt:reveal; the preview simulates it. */
  reveal?: { event: TtRevealEvent; id: number } | null;
  /** Optional end-round vote feature (preserved from the functional view). */
  onRequestEndRound?: () => void;
  onVoteEndRound?: (accept: boolean) => void;
}) {
  const me = useMemo(() => state.seats.find((s) => s.userId === meId), [state.seats, meId]);
  const opponents = useMemo(() => state.seats.filter((s) => s.userId !== meId), [state.seats, meId]);
  const turnTotalMs = state.roundTimerSec ? Math.min(state.roundTimerSec, 30) * 1000 : 30_000;

  const isMyTurn = state.mode === "NORMAL" && me != null && state.turnSeat === me.seat;
  const hintOpen = state.mode === "HINT" && state.hint?.phase === "OPEN";
  const canGuess = (isMyTurn || (hintOpen && !me?.locked)) && me?.status === "ACTIVE";

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

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // shake the search bar when MY wrong-attempt count rises (hint mode feedback).
  const [shakeKey, setShakeKey] = useState(0);
  const prevWrong = useRef(me?.wrongAttempts ?? 0);
  useEffect(() => {
    const w = me?.wrongAttempts ?? 0;
    if (w > prevWrong.current) setShakeKey((k) => k + 1);
    prevWrong.current = w;
  }, [me?.wrongAttempts]);

  // unlock the audio context on the first user gesture (autoplay policy).
  useEffect(() => {
    const unlock = () => ttSound.unlock();
    const opts = { passive: true } as const;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
    <FlyProvider enabled={TT_ANIMATIONS_ENABLED}>
    <main
      className="fixed inset-0 z-40 mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-[var(--lu-abyss)] px-2"
      style={{ paddingTop: "max(0.45rem, env(safe-area-inset-top))", paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))" }}
    >
      {/* top bar — mirrors Link Up's table header (right-aligned action cluster):
          standings + end-round, then the sound toggle, then Withdraw (two-step confirm).
          Round/difficulty sits subtly on the left. */}
      <header className="flex shrink-0 items-center justify-between gap-2 pb-1">
        <span className="num rounded-full border border-[var(--lu-gold-1)]/25 bg-black/40 px-2.5 py-0.5 text-[0.7rem] font-bold text-[var(--lu-tan)]">
          الجولة {state.roundNo}/{state.roundsTotal} · {DIFF_AR[state.difficulty] ?? state.difficulty}
        </span>
        <div className="flex items-center gap-1.5">
          <TenStandings seats={state.seats} meId={meId} />
          {onRequestEndRound && !state.endRoundRequest ? (
            <button onClick={onRequestEndRound} title="طلب إنهاء الجولة" aria-label="طلب إنهاء الجولة" className="grid size-8 place-items-center rounded-full border border-[var(--lu-gold-1)]/25 bg-[#0b0908]/70 text-[0.85rem] text-[var(--lu-cream)]/80 transition hover:border-[var(--lu-gold-1)]/45">
              ⏭
            </button>
          ) : null}
          <SoundButton />
          {/* creator-only Close Table (ends the table for everyone) — two-step confirm */}
          {onClose ? (
            confirmClose ? (
              <span className="flex items-center gap-1">
                <button onClick={onClose} className="rounded-lg bg-[#a33] px-2.5 py-1 text-xs font-bold text-white">تأكيد الإغلاق</button>
                <button onClick={() => setConfirmClose(false)} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-[var(--lu-cream)]">إلغاء</button>
              </span>
            ) : (
              <button onClick={() => setConfirmClose(true)} className="rounded-lg border border-[#d9694f]/40 bg-[#d9694f]/10 px-2.5 py-1 text-xs font-bold text-[#d9694f]">
                إغلاق الطاولة
              </button>
            )
          ) : null}
          {onLeave ? (
            confirmLeave ? (
              <span className="flex items-center gap-1">
                <button onClick={onLeave} className="rounded-lg bg-[#a33] px-2.5 py-1 text-xs font-bold text-white">تأكيد الخروج</button>
                <button onClick={() => setConfirmLeave(false)} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-[var(--lu-cream)]">إلغاء</button>
              </span>
            ) : (
              <button onClick={() => setConfirmLeave(true)} className="rounded-lg border border-[#d9694f]/40 bg-[#d9694f]/10 px-2.5 py-1 text-xs font-bold text-[#d9694f]">
                خروج
              </button>
            )
          ) : null}
        </div>
      </header>
      {confirmLeave ? (
        <p className="mb-1 shrink-0 rounded-lg border border-[#d9694f]/30 bg-[#d9694f]/10 px-3 py-1.5 text-center text-[0.72rem] text-[var(--lu-cream)]">
          إذا خرجت الآن تنسحب من المباراة وتخسر نقاطك المتجمّعة.
        </p>
      ) : null}

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

        {/* banner crown — the full question title in a distinct framed card (never
            truncated; wraps). The competition/season is already in the title; the
            progress line was removed to give the cards more room. */}
        <div className="relative z-10 mb-1.5 shrink-0 px-0.5">
          <div className="lu-frame rounded-2xl px-3 py-2 text-center">
            <div className="lu-gold-text lu-gold-title text-[clamp(0.88rem,4.1vw,1.18rem)] font-black leading-snug">
              {state.question?.titleAr ?? "—"}
            </div>
          </div>
        </div>

        {/* the 10 rank cards — two columns pushed to the LEFT/RIGHT pitch edges
            (justify-between) with a large clear CENTRE gap reserved for the reveal
            notice + hint countdown. Horizontal padding keeps cards off the pitch lines.
            Height-driven (grid-rows-5 = equal 1fr rows) → fits any phone, no scroll. */}
        <div className="relative z-10 grid min-h-0 flex-1 grid-rows-5 grid-cols-[auto_auto] justify-between gap-y-2 px-3 pt-1 sm:px-6">
          {byRank.map((c) => (
            <TenCard
              key={c.rank}
              card={c}
              metricType={state.question?.type}
              hintMode={hint}
              anchor={`ten-card-${c.rank}`}
              hintTimerDeadlineTs={hintOpen && state.hint?.rank === c.rank ? state.deadlineTs : null}
              hintTimerTotalMs={TT_TIMING.hintAnswerSec * 1000}
            />
          ))}
        </div>

        {/* hint-mode theatre (start flash · circular countdown · hint text) */}
        <TenHintOverlay mode={state.mode} hint={state.hint} deadlineTs={state.deadlineTs} />
      </section>

      {/* pending end-round vote */}
      {state.endRoundRequest && onVoteEndRound ? (
        <div className="mt-1.5 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-[var(--lu-ember)]/40 bg-[var(--lu-ember)]/10 px-3 py-1.5 text-[0.74rem] text-[var(--lu-cream)]">
          <span className="num">طلب إنهاء الجولة · {state.endRoundRequest.approvals.length}/{state.endRoundRequest.needed}</span>
          {me && !state.endRoundRequest.approvals.includes(me.seat) ? (
            <span className="flex gap-1.5">
              <button onClick={() => onVoteEndRound(true)} className="rounded-lg bg-[var(--gold)] px-2.5 py-0.5 text-xs font-bold text-black">موافقة</button>
              <button onClick={() => onVoteEndRound(false)} className="rounded-lg bg-white/10 px-2.5 py-0.5 text-xs font-bold">رفض</button>
            </span>
          ) : (
            <span className="text-[var(--lu-tan)]">بانتظار البقية…</span>
          )}
        </div>
      ) : null}

      {/* one-time onboarding nudge (first round only) */}
      <div className="mt-1.5 shrink-0">
        <TenCoachmark active={state.roundNo === 1} />
      </div>

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

      {/* celebration + sound (fly star showers, rank-10 confetti, cues) */}
      <TenEffects
        reveal={reveal}
        mySeat={me?.seat}
        isMyTurn={isMyTurn}
        hintMode={hint}
        locked={!!(hint && me?.locked)}
      />
    </main>
    </FlyProvider>
    </MotionConfig>
  );
}
