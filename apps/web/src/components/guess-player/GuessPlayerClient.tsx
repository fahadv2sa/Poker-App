"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Atmosphere, BackIcon, BoltIcon, GoldButton, GoldGradientDefs, Panel, cn } from "@fb/top-10-ui";
import { SeatAvatar, useRemainingMs } from "@fb/table-ui";
import {
  GP_DIFFICULTIES,
  GP_LIMITS,
  type GpDifficulty,
  type GpMode,
  type GpRevealEvent,
  type GpStandingRow,
  type GpStateView,
} from "@fb/shared";
import { connectGuessPlayer, type GpConnection } from "@/lib/guess-player/socket";
import { gpSound } from "@/lib/guess-player/sound";
import { BackArrow } from "@/components/back-arrow";
import { GpTable } from "./GpTable";
import { GpSummary, type GpRoundSummary } from "./GpSummary";

/** A finished match's result, captured for the winner screen + leave summary. */
type MatchSnapshot = {
  match: number;
  standings: GpStandingRow[];
  seats: GpStateView["seats"];
};

const DIFF_AR: Record<GpDifficulty, string> = { EASY: "سهل", MEDIUM: "متوسط", HARD: "صعب" };
const DIFF_SUB: Record<GpDifficulty, string> = {
  EASY: "لاعبون مشهورون",
  MEDIUM: "تحدٍّ متوازن",
  HARD: "أسماء نادرة",
};

type View = "lobby" | "queue" | "match" | "connecting";

export function GuessPlayerClient({
  token,
  me,
  autoJoinCode,
  autoCreate,
}: {
  token: string;
  me: { userId: string; username: string };
  autoJoinCode?: string;
  autoCreate?: {
    mode: GpMode;
    difficulty?: GpDifficulty;
    isPrivate: boolean;
    roomName?: string;
    maxPlayers?: number;
  } | null;
}) {
  const router = useRouter();
  const connRef = useRef<GpConnection | null>(null);
  const autoFiredRef = useRef(false);
  const queueDiffRef = useRef<GpDifficulty | null>(null);
  const isDeepLink = !!(autoJoinCode || autoCreate);
  const [view, setView] = useState<View>(isDeepLink ? "connecting" : "lobby");
  const [state, setState] = useState<GpStateView | null>(null);
  const [queue, setQueue] = useState<{ waiting: number; countdownSec: number | null } | null>(null);
  const [result, setResult] = useState<MatchSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ event: GpRevealEvent; id: number } | null>(null);
  const [myPick, setMyPick] = useState<{ name: string; nameAr: string | null } | null>(null);
  // Completed rounds this SESSION (replays keep accumulating), for the
  // leave/after-winner table summary. Mirrored to a ref for socket handlers.
  const [roundsPlayed, setRoundsPlayed] = useState<GpRoundSummary[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const roundsRef = useRef<GpRoundSummary[]>([]);
  useEffect(() => {
    roundsRef.current = roundsPlayed;
  }, [roundsPlayed]);
  const revealSeq = useRef(0);
  const stateRef = useRef<GpStateView | null>(null);
  const roundNoRef = useRef(0);

  useEffect(() => {
    const conn = connectGuessPlayer(token, {
      onConnect: () => {
        if (queueDiffRef.current) conn.queueJoin(queueDiffRef.current);
        if (autoFiredRef.current) return;
        autoFiredRef.current = true;
        if (autoJoinCode)
          conn.join(autoJoinCode, (res) => {
            if (res?.error) {
              flash("تعذّر الانضمام إلى الغرفة");
              goHome();
            }
          });
        else if (autoCreate)
          conn.create(
            {
              mode: autoCreate.mode,
              difficulty: autoCreate.difficulty,
              isPrivate: autoCreate.isPrivate,
              roomName: autoCreate.roomName,
              maxPlayers: autoCreate.maxPlayers,
            },
            (res) => {
              if (res?.error) {
                flash("تعذّر إنشاء الغرفة");
                goHome();
              }
            },
          );
      },
      onState: (s) => {
        queueDiffRef.current = null;
        stateRef.current = s;
        // New round (or replay) started → clear the previous reveal + pick echo.
        if (s.roundNo !== roundNoRef.current) {
          const wasLive = roundNoRef.current > 0;
          roundNoRef.current = s.roundNo;
          setReveal(null);
          setMyPick(null);
          if (s.roundNo > 0 && s.status === "IN_PROGRESS" && wasLive) gpSound.play("roundStart");
        }
        if (s.status === "IN_PROGRESS") setResult(null);
        setState(s);
        setView("match");
      },
      onQuestion: (q) => {
        gpSound.play(q.answer === "YES" ? "yes" : q.answer === "NO" ? "no" : "unknown");
      },
      onWrongGuess: () => gpSound.play("wrongGuess"),
      onQueueState: (q) => {
        setQueue({ waiting: q.waiting, countdownSec: q.countdownSec });
        setView((v) => (v === "lobby" ? "queue" : v));
      },
      onQueueMatched: () => {
        queueDiffRef.current = null;
        setView("match");
      },
      onReveal: (r) => {
        setReveal({ event: r, id: ++revealSeq.current });
        if (r.reason !== "ABANDONED") setRoundsPlayed((rs) => [...rs, r]);
        gpSound.play(r.reason === "CORRECT_GUESS" ? "correctGuess" : "reveal");
      },
      onPickConfirmed: (p) => setMyPick({ name: p.player.name, nameAr: p.player.nameAr }),
      onMatchEnded: (m) => {
        const seats = stateRef.current?.seats ?? [];
        setResult({ match: 0, standings: m.standings, seats });
      },
      onToast: (p) => flash(p.text),
      onTableClosed: (p) => {
        // Host closed the table (or idle close) → show the session summary if
        // any round completed, exactly like a manual exit.
        flash(p.text ?? "أُغلقت الطاولة");
        if (roundsRef.current.length > 0) setShowSummary(true);
        else goHome();
      },
      onError: (msg) => flash(msg),
      onAuthExpired: () => {
        window.location.href = "/login";
      },
    });
    connRef.current = conn;
    return () => conn.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }
  const conn = useCallback(() => connRef.current, []);

  // Anti-cheat presence (mirrors Top Ten): away >2s in a live match is flagged.
  const myStatus = state?.seats.find((s) => s.userId === me.userId)?.status;
  const inLiveMatch = state?.status === "IN_PROGRESS" && myStatus === "ACTIVE";
  useEffect(() => {
    if (!inLiveMatch) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let flagged = false;
    const evaluate = () => {
      const away = document.visibilityState === "hidden" || !document.hasFocus();
      if (away) {
        if (!timer && !flagged) {
          timer = setTimeout(() => {
            connRef.current?.away();
            flagged = true;
            timer = null;
          }, 2000);
        }
      } else {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (flagged) {
          connRef.current?.back();
          flagged = false;
        }
      }
    };
    document.addEventListener("visibilitychange", evaluate);
    window.addEventListener("blur", evaluate);
    window.addEventListener("focus", evaluate);
    return () => {
      document.removeEventListener("visibilitychange", evaluate);
      window.removeEventListener("blur", evaluate);
      window.removeEventListener("focus", evaluate);
      if (timer) clearTimeout(timer);
      if (flagged) connRef.current?.back();
    };
  }, [inLiveMatch]);

  function goHome() {
    router.push("/games/guess-player");
  }
  // Leaving the table: release the seat, then — if any round completed — show
  // the table summary first (its close returns home); otherwise go straight
  // home. Mirrors Top Ten's leave-summary flow.
  function onExit() {
    conn()?.leave();
    if (roundsRef.current.length > 0) setShowSummary(true);
    else goHome();
  }

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col overflow-hidden bg-[var(--lu-abyss)] px-4 pb-6 page-top">
      <GoldGradientDefs />
      <Atmosphere />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="mb-3 flex shrink-0 items-center gap-3 pt-1">
          <BackArrow fallback="/games/guess-player" className="lu-btn lu-frame grid size-10 shrink-0 place-items-center rounded-xl">
            <BackIcon size={20} />
          </BackArrow>
          <span className="lu-chip grid size-11 shrink-0 place-items-center rounded-2xl ring-1 ring-[var(--lu-gold-1)]/30">
            <BoltIcon size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="lu-gold-text lu-gold-title truncate text-xl font-black leading-tight">لعب سريع</h1>
            <p className="truncate text-xs text-[var(--lu-tan)]">اسأل، استنتج، وخمّن اللاعب الخفي</p>
          </div>
        </header>

        {view === "lobby" && (
          <Lobby
            onJoin={(d) => {
              queueDiffRef.current = d;
              conn()?.queueJoin(d);
              setView("queue");
            }}
          />
        )}
        {view === "queue" && (
          <QueueView
            queue={queue}
            onCancel={() => {
              queueDiffRef.current = null;
              conn()?.queueLeave();
              setQueue(null);
              setView("lobby");
            }}
          />
        )}
        {view === "connecting" && <ConnectingView />}
        {view === "match" && state && !showSummary && (
          <MatchView
            state={state}
            me={me}
            result={result}
            reveal={reveal}
            myPick={myPick}
            lastRound={roundsPlayed.at(-1) ?? null}
            conn={conn}
            onExit={onExit}
          />
        )}
      </div>

      <AnimatePresence>
        {showSummary && state ? (
          <GpSummary
            rounds={roundsPlayed}
            seats={stateRef.current?.seats ?? state.seats}
            meId={me.userId}
            onClose={goHome}
          />
        ) : null}
      </AnimatePresence>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-black/80 px-5 py-2 text-[var(--lu-cream)] shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- Lobby / queue

function Lobby({ onJoin }: { onJoin: (d: GpDifficulty) => void }) {
  return (
    <div className="flex flex-col gap-4 fade-rise">
      <p className="text-sm text-[var(--lu-tan)]">اختر المستوى وابدأ فورًا — تُلعب ضد المنصة، وتصلح للعب الفردي.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {GP_DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onJoin(d)}
            className="lu-btn lu-frame flex flex-col gap-1 rounded-2xl p-5 text-right"
          >
            <span className="text-lg font-black text-[var(--lu-cream)]">{DIFF_AR[d]}</span>
            <span className="text-xs text-[var(--lu-tan)]">{DIFF_SUB[d]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConnectingView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 fade-rise">
      <span className="size-10 animate-spin rounded-full border-2 border-[var(--lu-gold-1)]/25 border-t-[var(--lu-gold-1)]" />
      <p className="text-sm text-[var(--lu-tan)]">جارٍ الاتصال…</p>
    </div>
  );
}

function QueueView({
  queue,
  onCancel,
}: {
  queue: { waiting: number; countdownSec: number | null } | null;
  onCancel: () => void;
}) {
  const count = queue?.waiting ?? 0;
  const max = GP_LIMITS.quickPlayMaxPlayers;
  const secs = queue?.countdownSec ?? null;
  return (
    <div className="lu-frame overflow-hidden rounded-3xl fade-rise">
      <div
        className="flex flex-col items-center gap-3 px-6 py-8 text-center"
        style={{ background: "radial-gradient(120% 90% at 50% -10%, rgb(var(--c-ember)/0.16), transparent 60%)" }}
      >
        <span className="text-sm tracking-[0.2em] text-[var(--lu-gold-1)]/80">لعب سريع</span>
        <span className="num text-5xl font-black text-[var(--lu-cream)]">
          {count}
          <span className="text-2xl text-[var(--lu-tan)]"> / {max}</span>
        </span>
        <span className="text-sm text-[var(--lu-tan)]">تبدأ المباراة بمن حضر — حتى لو كنت وحدك ضد المنصة</span>
        <div className="mt-1 flex items-center justify-center gap-2">
          {Array.from({ length: max }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-3 rounded-full transition",
                i < count ? "bg-[var(--lu-ember)] shadow-[0_0_10px_rgb(var(--c-ember)/0.6)]" : "bg-white/12",
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
        <button
          onClick={onCancel}
          className="lu-btn w-full rounded-md py-2 text-center font-bold text-[var(--fb-danger)] hover:text-[var(--fb-danger)]"
        >
          مغادرة الطابور
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Match

function MatchView({
  state,
  me,
  result,
  reveal,
  myPick,
  lastRound,
  conn,
  onExit,
}: {
  state: GpStateView;
  me: { userId: string; username: string };
  result: MatchSnapshot | null;
  reveal: { event: GpRevealEvent; id: number } | null;
  myPick: { name: string; nameAr: string | null } | null;
  lastRound: GpRoundSummary | null;
  conn: () => GpConnection | null;
  onExit: () => void;
}) {
  const onAsk = useCallback((input: Parameters<NonNullable<GpConnection["ask"]>>[0]) => conn()?.ask(input), [conn]);
  const onGuess = useCallback((id: string) => conn()?.guess(id), [conn]);
  const onPick = useCallback((id: string) => conn()?.pick(id), [conn]);

  if (state.status === "ENDED" || state.status === "ABANDONED") {
    return (
      <GpWinner
        state={state}
        meId={me.userId}
        result={result}
        lastRound={lastRound}
        abandoned={state.status === "ABANDONED"}
        onNewMatch={() => conn()?.newMatch()}
        onClose={state.createdByUserId === me.userId ? () => conn()?.close() : undefined}
        onExit={onExit}
      />
    );
  }

  if (state.status === "LOBBY") {
    return (
      <Panel className="fade-rise">
        <LobbyRoom state={state} me={me} conn={conn} onLeave={onExit} />
      </Panel>
    );
  }

  return (
    <GpTable
      state={state}
      meId={me.userId}
      reveal={reveal}
      myPick={myPick}
      onAsk={onAsk}
      onGuess={onGuess}
      onPick={onPick}
      onLeave={onExit}
    />
  );
}

// ---------------------------------------------------------------- Room lobby

function LobbyRoom({
  state,
  me,
  conn,
  onLeave,
}: {
  state: GpStateView;
  me: { userId: string; username: string };
  conn: () => GpConnection | null;
  onLeave: () => void;
}) {
  const isCreator = state.createdByUserId === me.userId;
  const filled = state.seats.length;
  const canStart = filled >= GP_LIMITS.minPlayers;
  const code = state.inviteCode ?? "";
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/games/guess-player/play?join=${encodeURIComponent(code)}`;
    const text = ["انضم لطاولتي بالضغط على الرابط أو إدخال الكود", code, "رابط الانضمام", url].join("\n");
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // dismissed — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing to do
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="truncate text-lg font-black lu-gold-text">{state.roomName?.trim() || "غرفة خاصة"}</h2>
        <span className="lu-chip shrink-0 rounded-full px-3 py-1 text-xs font-bold text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/30">
          {state.mode === "VS_HUMANS" ? "ضد الأصدقاء" : `ضد المنصة · ${state.difficulty ? DIFF_AR[state.difficulty] : ""}`}
        </span>
      </div>

      {code ? (
        <div className="relative overflow-hidden rounded-2xl border border-[var(--lu-gold-1)]/30 bg-gradient-to-b from-[var(--lu-gold-2)]/[0.12] to-transparent px-4 py-5 text-center">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-12 h-28"
            style={{ background: "radial-gradient(60% 100% at 50% 0%, rgb(var(--c-ember)/0.28), transparent)" }}
          />
          <div className="relative flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lu-gold-1)]/25 bg-[var(--lu-gold-2)]/10 px-3 py-1 text-[0.68rem] font-bold tracking-[0.18em] text-[var(--lu-gold-1)]">
              <span aria-hidden>🎟️</span> كود الدعوة
            </span>
            <div className="num inline-flex rounded-xl border border-[var(--lu-gold-1)]/40 bg-[var(--fb-surface)]/70 px-5 py-2.5 text-3xl font-black tracking-[0.3em] text-[var(--lu-gold-1)] shadow-[inset_0_1px_0_rgb(var(--c-white)/0.06),0_8px_20px_rgb(var(--c-black)/0.35)] sm:text-4xl">
              {code}
            </div>
            <p className="text-xs text-[var(--lu-tan)]">ادعُ أصدقاءك بالكود أو شارك الرابط مباشرة</p>
            <button
              type="button"
              onClick={onShare}
              className="lu-btn mt-1 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-md border border-[var(--lu-gold-1)]/40 bg-[var(--lu-gold-2)]/15 py-2.5 font-bold text-[var(--lu-gold-1)]"
            >
              <span aria-hidden className="text-base">🔗</span>
              {copied ? "تم نسخ الدعوة ✓" : "مشاركة الدعوة"}
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between px-0.5 text-xs">
          <span className="text-[var(--lu-tan)]">اللاعبون</span>
          <span className="num font-bold text-[var(--lu-cream)]">
            {filled} / {state.maxPlayers}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: state.maxPlayers }).map((_, i) => {
            const s = state.seats[i];
            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl border px-3 py-3 text-center",
                  s ? "border-[var(--lu-gold-1)]/30 bg-black/30" : "border-dashed border-white/12 bg-black/15",
                )}
              >
                {s ? (
                  <>
                    <div className="truncate text-sm font-semibold text-[var(--lu-cream)]">
                      {s.username}
                      {s.userId === me.userId ? " (أنت)" : ""}
                    </div>
                    {s.userId === state.createdByUserId ? (
                      <div className="text-[0.66rem] font-bold text-[var(--lu-gold-1)]">المضيف</div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--lu-tan)]">
                    <span className="size-1.5 animate-pulse rounded-full bg-[var(--lu-ember)]" />
                    بانتظار لاعب…
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {state.mode === "VS_HUMANS" ? (
        <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs leading-relaxed text-[var(--lu-tan)]">
          🎯 في وضع الأصدقاء: المضيف ينتقي اللاعبَ الخفي أولًا، ومن يخمّنه يصبح المنتقي في الجولة التالية.
        </p>
      ) : null}

      {isCreator ? (
        <GoldButton onClick={() => conn()?.start()} disabled={!canStart} className={cn(!canStart && "opacity-60")}>
          {canStart ? "ابدأ المباراة" : "بانتظار انضمام لاعب…"}
        </GoldButton>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 py-3 text-sm text-[var(--lu-tan)]">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-[var(--lu-ember)]" />
          بانتظار أن يبدأ المضيف المباراة…
        </div>
      )}
      <GoldButton variant="ghost" onClick={onLeave}>
        خروج
      </GoldButton>
    </div>
  );
}

// ---------------------------------------------------------------- Winner

export function GpWinner({
  state,
  meId,
  result,
  lastRound,
  abandoned,
  onNewMatch,
  onClose,
  onExit,
}: {
  state: GpStateView;
  meId: string;
  result: MatchSnapshot | null;
  /** The final round's reveal — the hidden player is ALWAYS shown here. */
  lastRound: GpRoundSummary | null;
  abandoned: boolean;
  onNewMatch: () => void;
  onClose?: () => void;
  onExit: () => void;
}) {
  const standings =
    result?.standings ??
    [...state.seats]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((s, i) => ({
        userId: s.userId,
        username: s.username,
        seat: s.seat,
        points: s.totalPoints,
        place: i + 1,
        tiedWithPrev: false,
      }));
  const seats = result?.seats ?? state.seats;
  const nm = state.newMatchRequest;
  const mySeat = state.seats.find((s) => s.userId === meId);
  const youReady = !!(nm && mySeat && nm.readySeats.includes(mySeat.seat));
  const canNewMatch = !abandoned;
  const showClose = !!onClose && !abandoned;
  const winner = !abandoned && standings.length > 0 && !standings[1]?.tiedWithPrev ? standings[0] : null;
  // Between rounds (no terminal result yet) this is the CUMULATIVE session
  // ladder, not a match verdict — the leader is framed as المتصدر, and the
  // session-close bonus framing only appears once the table actually closes.
  const sessionOver = abandoned || !!result;

  useEffect(() => {
    gpSound.play(abandoned ? "reveal" : "win");
  }, [abandoned]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex justify-center overflow-y-auto bg-[var(--lu-abyss)]/95 p-3 backdrop-blur-md sm:p-6"
    >
      <div className="my-auto w-full max-w-md space-y-3">
        {/* ── hidden-player reveal card — ALWAYS shown, solved or not ─────── */}
        {lastRound ? <HiddenPlayerCard round={lastRound} seats={seats} meId={meId} /> : null}

        {/* ── new-round flow: countdown auto-start + two clear actions ────── */}
        {canNewMatch && nm?.deadlineTs ? (
          <div className="flex flex-col items-center gap-1 pt-1">
            <span className="text-xs text-[var(--lu-tan)]">تبدأ جولة جديدة تلقائيًا خلال</span>
            <NewMatchCountdown deadlineTs={nm.deadlineTs} />
          </div>
        ) : null}
        <div className="space-y-2">
          {canNewMatch ? (
            <button
              type="button"
              onClick={onNewMatch}
              disabled={youReady}
              className={cn(
                "w-full rounded-2xl py-3.5 text-lg font-black transition",
                youReady
                  ? "border border-[var(--lu-gold-1)]/45 bg-[var(--lu-gold-2)]/12 text-[var(--lu-gold-1)]"
                  : "btn-gold-cta text-black",
              )}
            >
              {youReady ? "✓ جاهز — بانتظار البقية" : "▶ جولة جديدة"}
            </button>
          ) : null}
          <div className={cn("grid gap-2", showClose ? "grid-cols-2" : "grid-cols-1")}>
            <ResultAction glyph="⮐" label="خروج" variant="neutral" onClick={onExit} />
            {showClose ? <ResultAction glyph="✕" label="إغلاق الطاولة" variant="destructive" onClick={onClose!} /> : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col items-center gap-1">
            <span className="grid size-12 place-items-center rounded-full border border-[var(--lu-gold-1)]/50 bg-[var(--lu-gold-2)]/10 text-2xl">
              {abandoned ? "🚪" : winner ? "🏆" : "🤝"}
            </span>
            <div className="lu-gold-text lu-gold-title text-lg font-black">
              {sessionOver
                ? abandoned
                  ? "أُغلقت الطاولة"
                  : winner
                    ? "متصدر الجلسة"
                    : "تعادل في الصدارة"
                : "الترتيب التراكمي"}
            </div>
            {!sessionOver ? (
              <span className="text-[0.7rem] text-[var(--lu-tan)]">النقاط تتراكم ما دامت الطاولة مفتوحة</span>
            ) : null}
          </div>
          <div className="space-y-1.5">
            {standings.map((row) => {
              const seat = seats.find((s) => s.seat === row.seat);
              const gold = winner?.userId === row.userId;
              return (
                <div
                  key={row.userId}
                  className={cn(
                    "flex items-center gap-2.5 rounded-2xl border p-3",
                    gold
                      ? "border-[var(--lu-gold-1)]/45 bg-gradient-to-b from-[var(--lu-gold-2)]/15 to-transparent"
                      : "lu-frame",
                  )}
                >
                  <SeatAvatar
                    playerNumber={seat?.playerNumber ?? 0}
                    seed={seat?.username ?? row.username}
                    size={36}
                    sizeClass="size-9"
                    className="ring-1 ring-white/15"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-[var(--lu-cream)]">
                      {row.userId === meId ? "أنت" : row.username}
                      {row.tiedWithPrev ? " (تعادل)" : ""}
                    </div>
                    <div className="num text-[0.7rem] text-[var(--lu-tan)]">المركز #{row.place}</div>
                  </div>
                  <span className="num text-xl font-black text-[var(--gold)]">{row.points}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** The big auto-start countdown — ticks audibly over the final 5 seconds. */
function NewMatchCountdown({ deadlineTs }: { deadlineTs: number }) {
  const ms = useRemainingMs(deadlineTs) ?? 0;
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const lastTicked = useRef<number | null>(null);
  useEffect(() => {
    if (secs > 0 && secs <= 5 && lastTicked.current !== secs) {
      lastTicked.current = secs;
      gpSound.play("countTick");
    }
  }, [secs]);
  return (
    <span
      className={cn(
        "num grid size-16 place-items-center rounded-full border-2 text-3xl font-black",
        secs <= 5
          ? "border-[var(--lu-ember)]/70 text-[var(--lu-ember)] shadow-[0_0_18px_rgb(var(--c-ember)/0.4)]"
          : "border-[var(--lu-gold-1)]/50 text-[var(--lu-gold-1)]",
      )}
    >
      {secs}
    </span>
  );
}

/** Themed confetti pieces (core.css .confetti-pc) for the solved celebration. */
const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 61) % 100,
  color: ["var(--lu-gold-1)", "var(--lu-ember)", "var(--lu-ember-glow)", "var(--fb-gold-strong)"][i % 4],
  delay: (i * 0.23) % 1.6,
  duration: 2.6 + ((i * 0.37) % 1.8),
}));

/** The hidden player, ALWAYS revealed on the winner screen: celebratory when
 *  cracked (confetti + glow + who did it), neutral «لم يخمنه أحد» otherwise. */
function HiddenPlayerCard({
  round,
  seats,
  meId,
}: {
  round: GpRoundSummary;
  seats: GpStateView["seats"];
  meId: string;
}) {
  const solved = round.reason === "CORRECT_GUESS";
  const cracker = seats.find((s) => s.seat === round.winnerSeat);
  const picker = seats.find((s) => s.seat === round.pickerSeat);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
      className={cn(
        "relative overflow-hidden rounded-3xl border px-4 py-5 text-center",
        solved
          ? "border-[var(--lu-gold-1)]/60 bg-gradient-to-b from-[var(--lu-gold-2)]/18 to-[var(--fb-surface)]/95 shadow-[0_0_40px_rgb(var(--c-ember-glow)/0.35)]"
          : "lu-frame",
      )}
    >
      {solved ? (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="confetti-pc"
              style={{
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
              }}
            />
          ))}
        </span>
      ) : null}
      <div className="relative flex flex-col items-center gap-2">
        <span className="text-[0.68rem] font-bold tracking-[0.22em] text-[var(--lu-gold-1)]/80">
          اللاعب الخفي
        </span>
        {round.player.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={round.player.photoUrl}
            alt={round.player.nameAr ?? round.player.name}
            className={cn(
              "size-20 rounded-full object-cover ring-2",
              solved ? "ring-[var(--lu-gold-1)]/70" : "ring-[var(--lu-gold-1)]/35",
            )}
          />
        ) : (
          <span
            className={cn(
              "grid size-20 place-items-center rounded-full bg-[var(--lu-gold-2)]/15 text-3xl ring-2",
              solved ? "ring-[var(--lu-gold-1)]/70" : "ring-[var(--lu-gold-1)]/35",
            )}
          >
            ⚽
          </span>
        )}
        <div className="lu-gold-text lu-gold-title text-2xl font-black leading-tight">
          {round.player.nameAr ?? round.player.name}
        </div>
        <div className="num text-[0.7rem] text-[var(--lu-tan)]">{round.player.name}</div>
        {solved && cracker ? (
          <div className="mt-1 flex flex-col items-center gap-1">
            <span className="rounded-full border border-[var(--lu-gold-1)]/45 bg-[var(--lu-gold-2)]/12 px-4 py-1.5 text-sm font-black text-[var(--lu-cream)]">
              🎯 كشفه {cracker.userId === meId ? "أنت" : cracker.username}{" "}
              <span className="num text-[var(--lu-gold-1)]">+{round.winnerPoints}</span>
            </span>
            {picker && round.pickerPoints > 0 ? (
              <span className="text-[0.7rem] text-[var(--lu-tan)]">
                المنتقي {picker.userId === meId ? "أنت" : picker.username}{" "}
                <span className="num text-[var(--lu-gold-1)]">+{round.pickerPoints}</span>
              </span>
            ) : null}
          </div>
        ) : !solved ? (
          <span className="mt-1 rounded-full border border-[var(--border)] bg-[var(--fb-surface)] px-4 py-1.5 text-sm font-bold text-[var(--lu-tan)]">
            لم يخمنه أحد
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

function ResultAction({
  glyph,
  label,
  variant,
  onClick,
  disabled,
}: {
  glyph: string;
  label: string;
  variant: "primary" | "destructive" | "neutral";
  onClick: () => void;
  disabled?: boolean;
}) {
  const styles = {
    primary: "btn-gold-cta text-black",
    destructive: "border border-[var(--fb-danger)]/50 bg-[var(--fb-danger)]/15 text-[var(--fb-danger)]",
    neutral: "lu-frame text-[var(--lu-cream)]",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 text-sm font-bold transition disabled:opacity-60",
        styles[variant],
      )}
    >
      <span aria-hidden className="text-lg leading-none">
        {glyph}
      </span>
      {label}
    </button>
  );
}
