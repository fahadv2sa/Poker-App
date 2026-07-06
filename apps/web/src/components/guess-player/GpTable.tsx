"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@fb/top-10-ui";
import { SeatAvatar, useRemainingMs } from "@fb/table-ui";
import type { GpAskInput, GpQuestionView, GpRevealEvent, GpStateView } from "@fb/shared";
import { Composer } from "./Composer";
import { PlayerEntitySearch } from "./EntitySearch";
import { gpSound } from "@/lib/guess-player/sound";
import {
  BOARD_CATEGORIES,
  CHIP_MARK,
  categoryOf,
  chipTextAr,
  questionTextAr,
  type GpBoardCategory,
} from "./question-text";

/**
 * The live table: HUD (round + clocks) → seats → the shared Q&A board →
 * the action area (composer / guess / picker search / waiting banner).
 * The hidden player NEVER appears here — only the reveal overlay (a
 * round-end event) carries it.
 */
export function GpTable({
  state,
  meId,
  reveal,
  myPick,
  onAsk,
  onGuess,
  onPick,
  onLeave,
}: {
  state: GpStateView;
  meId: string;
  reveal: { event: GpRevealEvent; id: number } | null;
  /** VS_HUMANS: the private pick echo (picker's own screen only). */
  myPick: { name: string; nameAr: string | null } | null;
  onAsk: (input: GpAskInput) => void;
  onGuess: (playerId: string) => void;
  onPick: (playerId: string) => void;
  onLeave: () => void;
}) {
  const mySeat = state.seats.find((s) => s.userId === meId);
  const turnSeatObj = state.seats.find((s) => s.seat === state.turnSeat);
  const pickerSeatObj = state.seats.find((s) => s.isPicker);
  const iAmPicker = !!mySeat?.isPicker;
  const myTurn = mySeat != null && state.turnSeat === mySeat.seat && !iAmPicker;

  // Sound: "your turn" cue when the turn arrives at my seat.
  const prevMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !prevMyTurn.current) gpSound.play("turn");
    prevMyTurn.current = myTurn;
  }, [myTurn]);

  // Sound: urgency ticking over the last 5 seconds of MY turn timer.
  useEffect(() => {
    if (!myTurn || !state.deadlineTs) return;
    let lastSec: number | null = null;
    const iv = setInterval(() => {
      const remaining = state.deadlineTs! - Date.now();
      const sec = Math.ceil(remaining / 1000);
      if (remaining > 0 && sec <= 5 && sec !== lastSec) {
        lastSec = sec;
        gpSound.play("tick");
      }
    }, 200);
    return () => clearInterval(iv);
  }, [myTurn, state.deadlineTs]);

  // Safer exit (final ruling): the always-visible exit button opens a
  // confirmation dialog so accidental leaves are impossible.
  const [confirmExit, setConfirmExit] = useState(false);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-2 fade-rise">
      <Hud state={state} onLeave={() => setConfirmExit(true)} />
      <SeatsRow state={state} meId={meId} />
      <Board state={state} />
      <ActionArea
        state={state}
        meId={meId}
        myTurn={myTurn}
        iAmPicker={iAmPicker}
        turnName={turnSeatObj?.username ?? "—"}
        pickerName={pickerSeatObj?.username ?? "—"}
        myPick={myPick}
        guessesLeft={mySeat != null ? (state.seats.find((s) => s.seat === mySeat.seat)?.guessesLeft ?? 0) : 0}
        onAsk={onAsk}
        onGuess={onGuess}
        onPick={onPick}
      />
      {reveal ? <RevealOverlay reveal={reveal.event} seats={state.seats} meId={meId} /> : null}
      {confirmExit ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-[var(--lu-abyss)]/85 p-4 backdrop-blur-sm fade-rise">
          <div className="lu-frame w-full max-w-xs rounded-2xl p-5 text-center">
            <span aria-hidden className="text-3xl">🚪</span>
            <p className="mt-2 text-base font-black text-[var(--lu-cream)]">هل أنت متأكد من الخروج؟</p>
            <p className="mt-1 text-xs text-[var(--lu-tan)]">
              الانسحاب أثناء المباراة يُسقط نقاطك في هذه الطاولة.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmExit(false)}
                className="lu-btn lu-frame rounded-xl py-2.5 text-sm font-bold text-[var(--lu-cream)]"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={onLeave}
                className="rounded-xl border border-[var(--fb-danger)]/50 bg-[var(--fb-danger)]/15 py-2.5 text-sm font-black text-[var(--fb-danger)]"
              >
                تأكيد الخروج
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Clock({ deadlineTs, warnAtMs }: { deadlineTs: number | null; warnAtMs?: number }) {
  const ms = useRemainingMs(deadlineTs ?? 0) ?? 0;
  if (!deadlineTs) return null;
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const warn = warnAtMs != null && ms <= warnAtMs;
  return (
    <span className={cn("num font-black", warn ? "text-[var(--fb-danger)]" : "text-[var(--lu-cream)]")}>
      {mm > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : ss}
    </span>
  );
}

function Hud({ state, onLeave }: { state: GpStateView; onLeave: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <button
        type="button"
        onClick={onLeave}
        className="lu-btn lu-frame rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--fb-danger)]"
      >
        خروج
      </button>
      <div className="flex items-center gap-2">
        <span className="lu-chip rounded-full px-3 py-1 text-xs font-bold text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/30">
          الجولة <span className="num">{state.roundNo}</span>/<span className="num">{state.roundsTotal}</span>
        </span>
        {state.roundDeadlineTs ? (
          <span className="lu-frame rounded-full px-3 py-1 text-xs">
            ⏱ <Clock deadlineTs={state.roundDeadlineTs} warnAtMs={60_000} />
          </span>
        ) : null}
        {state.deadlineTs ? (
          <span className="lu-chip rounded-full px-3 py-1 text-xs ring-1 ring-[var(--lu-ember)]/40">
            <Clock deadlineTs={state.deadlineTs} warnAtMs={5_000} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SeatsRow({ state, meId }: { state: GpStateView; meId: string }) {
  return (
    <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
      {state.seats.map((s) => {
        const isTurn = state.turnSeat === s.seat;
        return (
          <div
            key={s.seat}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-2xl border px-2.5 py-1.5",
              isTurn
                ? "border-[var(--lu-gold-1)]/60 bg-[var(--lu-gold-2)]/10 shadow-[0_0_14px_rgb(var(--c-ember)/0.35)]"
                : "border-white/10 bg-black/25",
              s.status === "WITHDRAWN" && "opacity-40",
            )}
          >
            <SeatAvatar playerNumber={s.playerNumber} seed={s.username} size={28} sizeClass="size-7" />
            <div className="flex flex-col leading-tight">
              <span className="max-w-24 truncate text-xs font-bold text-[var(--lu-cream)]">
                {s.userId === meId ? "أنت" : s.username}
                {s.isPicker ? " 🎯" : ""}
                {s.away ? " 💤" : ""}
                {!s.connected && s.status === "ACTIVE" ? " ⚠️" : ""}
              </span>
              <span className="flex items-center gap-1 text-[0.62rem] text-[var(--lu-tan)]">
                <span className="num font-bold text-[var(--lu-gold-1)]">{s.totalPoints}</span>
                نقطة
                {!s.isPicker && s.status === "ACTIVE" ? (
                  <span className="mr-1 inline-flex gap-0.5" title="محاولات التخمين">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "size-1.5 rounded-full",
                          i < s.guessesLeft ? "bg-[var(--lu-ember)]" : "bg-white/15",
                        )}
                      />
                    ))}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The shared deduction board — grouped edition (final ruling): answers live
 * under the FOUR composer categories as collapsed rows (name + count),
 * multiple can be open, a new answer flashes its category row. Inside an
 * expanded category every answer is ONE compact chip («برشلونة ✓») — the full
 * sentence + asker appear ONLY in the tap popover. Wrong guesses are their
 * own separate section in the same compact style. Stays clean at 20+ answers.
 */
function Board({ state }: { state: GpStateView }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<GpBoardCategory | "guesses" | null>(null);
  const [popover, setPopover] = useState<{ q: GpQuestionView } | null>(null);
  const prevCounts = useRef<Record<string, number>>({});

  const byCategory = new Map<GpBoardCategory, GpQuestionView[]>();
  for (const c of BOARD_CATEGORIES) byCategory.set(c.id, []);
  for (const q of state.questions) byCategory.get(categoryOf(q.template))!.push(q);

  // Flash the category row when its count grows (a new answer landed there).
  useEffect(() => {
    const counts: Record<string, number> = { guesses: state.wrongGuesses.length };
    for (const [id, qs] of byCategory) counts[id] = qs.length;
    for (const [id, n] of Object.entries(counts)) {
      if (n > (prevCounts.current[id] ?? 0)) {
        setFlash(id as GpBoardCategory | "guesses");
        const t = setTimeout(() => setFlash(null), 1600);
        prevCounts.current = counts;
        return () => clearTimeout(t);
      }
    }
    prevCounts.current = counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.questions.length, state.wrongGuesses.length]);

  // New round → reset collapse/popover state.
  useEffect(() => {
    setOpen(new Set());
    setPopover(null);
    prevCounts.current = {};
  }, [state.roundNo]);

  function toggle(id: string) {
    setPopover(null);
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const empty = state.questions.length === 0 && state.wrongGuesses.length === 0;

  return (
    <div className="lu-frame min-h-0 flex-1 overflow-y-auto rounded-2xl p-2">
      {empty ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
          <span aria-hidden className="text-3xl opacity-60">❓</span>
          <p className="text-sm text-[var(--lu-tan)]">
            {state.phase === "PICKING" ? "بانتظار اختيار اللاعب الخفي…" : "ابدأوا بطرح الأسئلة لكشف اللاعب الخفي"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {BOARD_CATEGORIES.map((c) => {
            const qs = byCategory.get(c.id)!;
            const isOpen = open.has(c.id);
            return (
              <div key={c.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-expanded={isOpen}
                  disabled={qs.length === 0}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 transition-shadow disabled:opacity-45",
                    flash === c.id && "shadow-[inset_0_0_0_1.5px_rgb(var(--c-ember)/0.8),0_0_14px_rgb(var(--c-ember)/0.4)]",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--lu-cream)]">
                    <span aria-hidden>{c.icon}</span>
                    {c.label}
                    <span
                      className={cn(
                        "num rounded-full px-1.5 text-[0.66rem] font-black ring-1",
                        flash === c.id
                          ? "text-[var(--lu-ember-glow)] ring-[var(--lu-ember)]/60"
                          : "text-[var(--lu-gold-1)] ring-[var(--lu-gold-1)]/35",
                      )}
                    >
                      {qs.length}
                    </span>
                  </span>
                  <span aria-hidden className="text-[0.6rem] text-[var(--lu-tan)]">
                    {isOpen ? "▲" : "▼"}
                  </span>
                </button>
                {isOpen && qs.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 border-t border-white/10 px-2.5 py-2">
                    {qs.map((q) => {
                      const m = CHIP_MARK[q.answer];
                      const active = popover?.q.turnNo === q.turnNo;
                      return (
                        <button
                          key={q.turnNo}
                          type="button"
                          onClick={() => setPopover(active ? null : { q })}
                          title="اضغط لعرض السؤال كاملًا"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1",
                            m.cls,
                            active && "ring-2",
                          )}
                        >
                          <span className="text-[var(--lu-cream)]">{chipTextAr(q)}</span>
                          <span aria-hidden className="font-black">{m.mark}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* wrong guesses — separate section, same compact style */}
          {state.wrongGuesses.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-[var(--fb-danger)]/25 bg-[var(--fb-danger)]/[0.05]">
              <button
                type="button"
                onClick={() => toggle("guesses")}
                aria-expanded={open.has("guesses")}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 transition-shadow",
                  flash === "guesses" && "shadow-[inset_0_0_0_1.5px_rgb(var(--c-ember)/0.8),0_0_14px_rgb(var(--c-ember)/0.4)]",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--lu-cream)]">
                  <span aria-hidden>🎯</span>
                  تخمينات خاطئة
                  <span className="num rounded-full px-1.5 text-[0.66rem] font-black text-[var(--fb-danger)] ring-1 ring-[var(--fb-danger)]/40">
                    {state.wrongGuesses.length}
                  </span>
                </span>
                <span aria-hidden className="text-[0.6rem] text-[var(--lu-tan)]">
                  {open.has("guesses") ? "▲" : "▼"}
                </span>
              </button>
              {open.has("guesses") ? (
                <div className="flex flex-wrap gap-1.5 border-t border-[var(--fb-danger)]/20 px-2.5 py-2">
                  {state.wrongGuesses.map((g, i) => {
                    const guesser = state.seats.find((s) => s.seat === g.seat);
                    return (
                      <span
                        key={i}
                        title={`خمّنها ${guesser?.username ?? "—"}`}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--fb-danger)]/10 px-2.5 py-1 text-xs font-bold text-[var(--lu-cream)] ring-1 ring-[var(--fb-danger)]/40"
                      >
                        {g.player.nameAr ?? g.player.name}
                        <span aria-hidden className="font-black text-[var(--fb-danger)]">✗</span>
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* the ONLY place the full sentence appears during play */}
          {popover ? (
            <div className="rounded-xl border border-[var(--lu-gold-1)]/35 bg-black/50 px-3 py-2 text-xs fade-rise">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block font-semibold leading-relaxed text-[var(--lu-cream)]">
                    {questionTextAr(popover.q)}
                  </span>
                  <span className="text-[0.66rem] text-[var(--lu-tan)]">
                    سألها: {state.seats.find((s) => s.seat === popover.q.seat)?.username ?? "—"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPopover(null)}
                  aria-label="إغلاق"
                  className="shrink-0 text-[var(--lu-tan)]"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ActionArea({
  state,
  myTurn,
  iAmPicker,
  turnName,
  pickerName,
  myPick,
  guessesLeft,
  onAsk,
  onGuess,
  onPick,
}: {
  state: GpStateView;
  meId: string;
  myTurn: boolean;
  iAmPicker: boolean;
  turnName: string;
  pickerName: string;
  myPick: { name: string; nameAr: string | null } | null;
  guessesLeft: number;
  onAsk: (input: GpAskInput) => void;
  onGuess: (playerId: string) => void;
  onPick: (playerId: string) => void;
}) {
  const [tab, setTab] = useState<"ask" | "guess">("ask");

  if (state.phase === "PICKING") {
    if (iAmPicker) {
      return (
        <div className="shrink-0 rounded-2xl border border-[var(--lu-gold-1)]/35 bg-[var(--lu-gold-2)]/[0.08] p-3">
          <p className="mb-2 text-sm font-bold text-[var(--lu-gold-1)]">
            أنت المنتقي 🎯 — اختر اللاعب الخفي (سرّي، من كل قاعدة اللاعبين)
          </p>
          <PlayerEntitySearch onPick={onPick} placeholder="ابحث عن اللاعب الخفي…" />
        </div>
      );
    }
    return (
      <WaitBanner text={`ينتقي ${pickerName} اللاعبَ الخفي…`} deadlineTs={state.deadlineTs} />
    );
  }

  // PLAYING
  if (iAmPicker) {
    return (
      <div className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--fb-surface)] px-3 py-2.5 text-center text-sm text-[var(--lu-tan)]">
        أنت المنتقي هذه الجولة{myPick ? <> — اللاعب الخفي: <b className="text-[var(--lu-gold-1)]">{myPick.nameAr ?? myPick.name}</b></> : null}. المنصة تجيب تلقائيًا.
      </div>
    );
  }
  if (!myTurn) {
    return <WaitBanner text={`دور ${turnName}…`} deadlineTs={state.deadlineTs} />;
  }

  return (
    <div className="shrink-0 rounded-2xl border border-[var(--lu-gold-1)]/35 bg-[var(--fb-surface)] p-3">
      {/* segmented mode switch: ask (gold) / guess (ember, with attempt pips) */}
      <div className="mb-2.5 flex rounded-xl bg-[var(--fb-surface-2)] p-1 ring-1 ring-[var(--border)]">
        <ModeBtn
          active={tab === "ask"}
          onClick={() => setTab("ask")}
          tone="gold"
          icon="❓"
          label="اسأل سؤالًا"
        />
        <ModeBtn
          active={tab === "guess"}
          onClick={() => setTab("guess")}
          tone="ember"
          icon="🎯"
          label="خمّن"
          pips={guessesLeft}
        />
      </div>
      {tab === "ask" ? (
        <Composer onAsk={onAsk} />
      ) : guessesLeft > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-center text-xs text-[var(--lu-tan)]">
            تخمين خاطئ يستهلك محاولة — المتبقي{" "}
            <span className="num font-bold text-[var(--lu-ember)]">{guessesLeft}</span> من{" "}
            <span className="num">3</span>
          </p>
          <PlayerEntitySearch onPick={onGuess} placeholder="🎯 من هو اللاعب الخفي؟" />
        </div>
      ) : (
        <p className="rounded-xl border border-[var(--fb-danger)]/30 bg-[var(--fb-danger)]/[0.08] px-3 py-2.5 text-center text-sm text-[var(--fb-danger)]">
          استنفدت محاولات التخمين — تابع بالأسئلة لمساعدة البقية
        </p>
      )}
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  tone,
  icon,
  label,
  pips,
}: {
  active: boolean;
  onClick: () => void;
  tone: "gold" | "ember";
  icon: string;
  label: string;
  pips?: number;
}) {
  const activeCls =
    tone === "gold"
      ? "lu-chip text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/55"
      : "bg-[var(--lu-ember)]/12 text-[var(--lu-ember)] ring-1 ring-[var(--lu-ember)]/55 shadow-[0_0_12px_rgb(var(--c-ember)/0.3)]";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-black transition",
        // ALWAYS fully visible — never hover-gated (mobile-first ruling #2).
        active ? activeCls : "bg-[var(--fb-surface)] text-[var(--lu-cream)]/85 ring-1 ring-[var(--border)]",
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
      {pips != null ? (
        <span className="mr-0.5 inline-flex gap-0.5" aria-label={`${pips} محاولات متبقية`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full",
                // Spent pips use muted-ink alpha (visible on BOTH themes;
                // literal white/15 vanished on Daylight).
                i < pips
                  ? "bg-[var(--lu-ember)] shadow-[0_0_6px_rgb(var(--c-ember)/0.7)]"
                  : "bg-[var(--lu-tan)]/35",
              )}
            />
          ))}
        </span>
      ) : null}
    </button>
  );
}

function WaitBanner({ text, deadlineTs }: { text: string; deadlineTs: number | null }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--fb-surface)] px-3 py-3 text-sm text-[var(--lu-tan)]">
      <span aria-hidden className="size-2 animate-pulse rounded-full bg-[var(--lu-ember)]" />
      {text}
      {deadlineTs ? (
        <span className="lu-chip rounded-full px-2 py-0.5 text-xs ring-1 ring-[var(--lu-gold-1)]/30">
          <Clock deadlineTs={deadlineTs} warnAtMs={5_000} />
        </span>
      ) : null}
    </div>
  );
}

/** End-of-round reveal — the ONLY place the hidden player's identity appears. */
function RevealOverlay({
  reveal,
  seats,
  meId,
}: {
  reveal: GpRevealEvent;
  seats: GpStateView["seats"];
  meId: string;
}) {
  const winner = seats.find((s) => s.seat === reveal.winnerSeat);
  const picker = seats.find((s) => s.seat === reveal.pickerSeat);
  const solved = reveal.reason === "CORRECT_GUESS";
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-[var(--lu-abyss)]/92 p-4 backdrop-blur-sm fade-rise">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <span className="text-xs tracking-[0.2em] text-[var(--lu-gold-1)]/80">اللاعب الخفي</span>
        {reveal.player.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={reveal.player.photoUrl}
            alt={reveal.player.nameAr ?? reveal.player.name}
            className="size-20 rounded-full object-cover ring-2 ring-[var(--lu-gold-1)]/50"
          />
        ) : (
          <span className="grid size-20 place-items-center rounded-full bg-[var(--lu-gold-2)]/15 text-3xl ring-2 ring-[var(--lu-gold-1)]/50">
            ⚽
          </span>
        )}
        <div className="lu-gold-text lu-gold-title text-2xl font-black">
          {reveal.player.nameAr ?? reveal.player.name}
        </div>
        <div className="text-xs text-[var(--lu-tan)]">{reveal.player.name}</div>
        {solved && winner ? (
          <div className="rounded-2xl border border-[var(--lu-gold-1)]/40 bg-[var(--lu-gold-2)]/10 px-4 py-2 text-sm font-bold text-[var(--lu-cream)]">
            🏆 {winner.userId === meId ? "أنت" : winner.username} كشفه —{" "}
            <span className="num text-[var(--lu-gold-1)]">+{reveal.winnerPoints}</span> نقطة
          </div>
        ) : (
          <div className="rounded-2xl border border-white/15 bg-black/30 px-4 py-2 text-sm text-[var(--lu-tan)]">
            انتهى الوقت دون تخمين صحيح
          </div>
        )}
        {picker && reveal.pickerPoints > 0 ? (
          <div className="text-xs text-[var(--lu-tan)]">
            🎯 {picker.userId === meId ? "أنت" : picker.username} (المنتقي):{" "}
            <span className="num font-bold text-[var(--lu-gold-1)]">+{reveal.pickerPoints}</span> نقطة
          </div>
        ) : null}
      </div>
    </div>
  );
}
