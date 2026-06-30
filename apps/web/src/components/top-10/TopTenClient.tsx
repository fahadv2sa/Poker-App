"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Atmosphere, BackIcon, BoltIcon, GoldButton, GoldGradientDefs, Panel, cn } from "@fb/top-10-ui";
import { SeatAvatar, useRemainingMs } from "@fb/table-ui";
import {
  TT_DIFFICULTIES,
  TT_MAX_PLAYERS,
  TT_MIN_PLAYERS,
  type TtDifficulty,
  type TtStandingRow,
  type TtStateView,
} from "@fb/shared";
import { connectTopTen, type TtConnection } from "@/lib/top-10/socket";
import { TenTable } from "./table/TenTable";
import { ttSound } from "@/lib/top-10/sound";
import type { TtRevealEvent } from "@fb/shared";

/** A completed round's result, captured for the live winner screen + the leave-summary. */
type RoundSnapshot = {
  round: number;
  standings: TtStandingRow[];
  seats: TtStateView["seats"];
  cards: TtStateView["cards"];
};

const DIFF_AR: Record<TtDifficulty, string> = { EASY: "سهل", MEDIUM: "متوسط", HARD: "صعب" };

type View = "lobby" | "queue" | "match";
export type PlayScreen = "quick" | "create" | "join";

export function TopTenClient({
  token,
  me,
  autoJoinCode,
  autoCreate,
}: {
  token: string;
  me: { userId: string; username: string };
  /** Deep-link from /rooms: join this invite code on connect. */
  autoJoinCode?: string;
  /** Deep-link from /create-room: create a room with these settings on connect. */
  autoCreate?: {
    difficulty: TtDifficulty;
    minutes: number;
    isPrivate: boolean;
    roomName?: string;
    maxPlayers?: number;
  } | null;
}) {
  const connRef = useRef<TtConnection | null>(null);
  const autoFiredRef = useRef(false);
  // The quick-play difficulty the player is queued for — re-asserted on every (re)connect
  // so a dropped socket doesn't strand them out of the matchmaking queue.
  const queueDiffRef = useRef<TtDifficulty | null>(null);
  const [view, setView] = useState<View>("lobby");
  const [state, setState] = useState<TtStateView | null>(null);
  const [queue, setQueue] = useState<{ waiting: number; needed: number; countdownSec: number | null } | null>(null);
  const [result, setResult] = useState<RoundSnapshot | null>(null);
  const [rounds, setRounds] = useState<RoundSnapshot[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ event: TtRevealEvent; id: number } | null>(null);
  const revealSeq = useRef(0);
  // Latest state — so onMatchEnded can snapshot the seat roster for the breakdown.
  const stateRef = useRef<TtStateView | null>(null);

  useEffect(() => {
    const conn = connectTopTen(token, {
      onConnect: () => {
        // Re-assert queue membership on EVERY (re)connect — the queue is socket-scoped
        // and lost on a drop. The server resyncs the room instead if we're already in one.
        if (queueDiffRef.current) conn.queueJoin(queueDiffRef.current);
        if (autoFiredRef.current) return;
        autoFiredRef.current = true;
        if (autoJoinCode) conn.join(autoJoinCode);
        else if (autoCreate)
          conn.create({
            difficulty: autoCreate.difficulty,
            roundTimerSec: autoCreate.minutes * 60,
            isPrivate: autoCreate.isPrivate,
            roomName: autoCreate.roomName,
            maxPlayers: autoCreate.maxPlayers,
          });
      },
      onState: (s) => {
        // A room snapshot means we're seated (lobby or match), not queueing.
        queueDiffRef.current = null;
        stateRef.current = s;
        setState(s);
        // a (re)started round clears the previous winner overlay
        if (s.status === "IN_PROGRESS") setResult(null);
        setView("match");
      },
      onQueueState: (q) => {
        setQueue({ waiting: q.waiting, needed: q.needed, countdownSec: q.countdownSec });
        // defensive: if a queue update arrives while still on the lobby, show the queue
        setView((v) => (v === "lobby" ? "queue" : v));
      },
      onQueueMatched: () => {
        queueDiffRef.current = null;
        setView("match");
      },
      onReveal: (r) => setReveal({ event: r, id: ++revealSeq.current }),
      onMatchEnded: (m) => {
        const seats = stateRef.current?.seats ?? [];
        const snap: RoundSnapshot = { round: 0, standings: m.standings, seats, cards: m.cards ?? [] };
        setResult(snap);
        setRounds((rs) => [...rs, { ...snap, round: rs.length + 1 }]);
      },
      onToast: (p) => flash(p.text),
      onError: (msg) => flash(msg),
      onAuthExpired: () => {
        window.location.href = "/login";
      },
    });
    connRef.current = conn;
    return () => conn.disconnect();
  }, [token]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }
  const conn = useCallback(() => connRef.current, []);

  function backToLobby() {
    conn()?.leave();
    setState(null);
    stateRef.current = null;
    queueDiffRef.current = null;
    setResult(null);
    setRounds([]);
    setShowSummary(false);
    setQueue(null);
    setView("lobby");
  }

  // Leaving the table: like Link Up, if any round was played show the round summary
  // first; otherwise drop straight back to the quick-play lobby.
  function onExit() {
    conn()?.leave();
    if (rounds.length > 0) setShowSummary(true);
    else backToLobby();
  }

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col overflow-hidden bg-[var(--lu-abyss)] px-4 pb-6 page-top">
      <GoldGradientDefs />
      <Atmosphere />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <header className="mb-3 flex shrink-0 items-center gap-3 pt-1">
        <a href="/games/top-10" aria-label="رجوع" className="lu-btn lu-frame grid size-10 shrink-0 place-items-center rounded-xl">
          <BackIcon size={20} />
        </a>
        <span className="lu-chip grid size-11 shrink-0 place-items-center rounded-2xl ring-1 ring-[var(--lu-gold-1)]/30">
          <BoltIcon size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="lu-gold-text lu-gold-title truncate text-xl font-black leading-tight">لعب سريع</h1>
          <p className="truncate text-xs text-[var(--lu-tan)]">انضمّ لطاولة فورية</p>
        </div>
      </header>

      {view === "lobby" && (
        <Lobby
          onJoin={(d) => {
            queueDiffRef.current = d; // remember so a reconnect re-queues automatically
            conn()?.queueJoin(d);
            setView("queue"); // show the filling queue immediately (like Link Up)
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
      {view === "match" && state && !showSummary && (
        <MatchView state={state} me={me} result={result} reveal={reveal} conn={conn} onExit={onExit} />
      )}
      </div>

      <AnimatePresence>
        {showSummary ? <TenTableSummary rounds={rounds} meId={me.userId} onClose={backToLobby} /> : null}
      </AnimatePresence>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-black/80 px-5 py-2 text-[var(--lu-cream)] shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- Lobby

const DIFF_SUB: Record<TtDifficulty, string> = {
  EASY: "لاعبون مشهورون",
  MEDIUM: "تحدٍّ متوازن",
  HARD: "أسماء نادرة",
};

/** The /play lobby = QUICK PLAY (matchmaking + bots). Create/join are their own
 *  dedicated pages (/create-room, /rooms); links provided for discoverability. */
function Lobby({ onJoin }: { onJoin: (d: TtDifficulty) => void }) {
  return (
    <div className="flex flex-col gap-4 fade-rise">
      <p className="text-sm text-[var(--lu-tan)]">اختر المستوى وابدأ فورًا — تُملأ المقاعد بالبوتات عند الحاجة.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {TT_DIFFICULTIES.map((d) => (
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

// ---------------------------------------------------------------- Queue

/** Waiting lobby — mirrors Link Up's QuickPlay waiting view (count/max, seat dots,
 *  countdown chip, leave). */
function QueueView({
  queue,
  onCancel,
}: {
  queue: { waiting: number; needed: number; countdownSec: number | null } | null;
  onCancel: () => void;
}) {
  const count = queue?.waiting ?? 0;
  const min = queue?.needed ?? TT_MIN_PLAYERS;
  const max = TT_MAX_PLAYERS;
  const secs = queue?.countdownSec ?? null;
  const ready = count >= min;
  return (
    <div className="lu-frame overflow-hidden rounded-3xl fade-rise">
      <div
        className="flex flex-col items-center gap-3 px-6 py-8 text-center"
        style={{ background: "radial-gradient(120% 90% at 50% -10%, rgba(255,106,26,0.16), transparent 60%)" }}
      >
        <span className="text-sm tracking-[0.2em] text-[var(--lu-gold-1)]/80">لعب سريع</span>
        <span className="num text-5xl font-black text-[var(--lu-cream)]">
          {count}
          <span className="text-2xl text-[var(--lu-tan)]"> / {max}</span>
        </span>
        <span className="text-sm text-[var(--lu-tan)]">
          {ready ? "اكتمل العدد الأدنى — تبدأ المباراة قريبًا" : `بانتظار ${min} لاعبين على الأقل…`}
        </span>
        <div className="mt-1 flex items-center justify-center gap-2">
          {Array.from({ length: max }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-3 rounded-full transition",
                i < count ? "bg-[var(--lu-ember)] shadow-[0_0_10px_rgba(255,106,26,0.6)]" : "bg-white/12",
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
          className="lu-btn w-full rounded-md py-2 text-center font-bold text-[#d9694f] hover:text-[#d9694f]"
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
  conn,
  onExit,
}: {
  state: TtStateView;
  me: { userId: string; username: string };
  result: RoundSnapshot | null;
  reveal: { event: TtRevealEvent; id: number } | null;
  conn: () => TtConnection | null;
  onExit: () => void;
}) {
  const mySeat = useMemo(() => state.seats.find((s) => s.userId === me.userId), [state, me]);
  // Stable guess handler so the memoized PlayerSearch isn't re-created each render.
  const onPick = useCallback((id: string) => conn()?.guess(id), [conn]);

  if (state.status === "ENDED" || state.status === "ABANDONED") {
    return (
      <TenWinner
        state={state}
        meId={me.userId}
        result={result}
        abandoned={state.status === "ABANDONED"}
        onNewRound={() => conn()?.newRound()}
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

  // IN_PROGRESS — the immersive felt table (full-screen overlay).
  return (
    <TenTable
      state={state}
      meId={me.userId}
      nickname={mySeat?.username ?? me.username}
      reveal={reveal}
      onPick={onPick}
      onLeave={onExit}
    />
  );
}

function seatToStanding(s: TtStateView["seats"][number], i: number): TtStandingRow {
  return { userId: s.userId, username: s.username, seat: s.seat, points: s.totalPoints, place: i + 1, tiedWithPrev: false };
}

/** Private-room lobby — mirrors Link Up's create-room lobby (LobbyPanel): a premium
 *  gold INVITE CARD (code + native share / clipboard) shown until the room fills,
 *  the seat list (filled + waiting placeholders up to the cap), and the host's
 *  start button. Sharing leaves the page mounted; even if the OS backgrounds the
 *  tab, the server now holds the seat for the reconnect grace (no drop). */
function LobbyRoom({
  state,
  me,
  conn,
  onLeave,
}: {
  state: TtStateView;
  me: { userId: string; username: string };
  conn: () => TtConnection | null;
  onLeave: () => void;
}) {
  const isCreator = state.createdByUserId === me.userId;
  const filled = state.seats.length;
  const canStart = filled >= TT_MIN_PLAYERS;
  const code = state.inviteCode ?? "";
  const [copied, setCopied] = useState(false);

  // Share the invite via the native share sheet (Web Share API), falling back to the
  // clipboard. The URL deep-links into /play?join=CODE (auto-joins the room). Each item
  // on its OWN line — the URL alone on its line renders cleanly in RTL chats (mirrors
  // Link Up's share text verbatim).
  const onShare = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/games/top-10/play?join=${encodeURIComponent(code)}`;
    const text = ["انضم لطاولتي بالضغط على الرابط أو إدخال الكود", code, "رابط الانضمام", url].join("\n");
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // dismissed / failed — nothing to do
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
      {/* room title + difficulty chip */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="truncate text-lg font-black lu-gold-text">{state.roomName?.trim() || "غرفة خاصة"}</h2>
        <span className="lu-chip shrink-0 rounded-full px-3 py-1 text-xs font-bold text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/30">
          {DIFF_AR[state.difficulty]}
        </span>
      </div>

      {/* ── Invite card: premium gold panel with the code + share ───────────── */}
      {code ? (
        <div className="relative overflow-hidden rounded-2xl border border-[var(--lu-gold-1)]/30 bg-gradient-to-b from-[var(--lu-gold-2)]/[0.12] to-transparent px-4 py-5 text-center">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-12 h-28"
            style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(255,106,26,0.28), transparent)" }}
          />
          <div className="relative flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lu-gold-1)]/25 bg-[var(--lu-gold-2)]/10 px-3 py-1 text-[0.68rem] font-bold tracking-[0.18em] text-[var(--lu-gold-1)]">
              <span aria-hidden>🎟️</span> كود الدعوة
            </span>
            <div className="num inline-flex rounded-xl border border-[var(--lu-gold-1)]/40 bg-[#0b0908]/70 px-5 py-2.5 text-3xl font-black tracking-[0.3em] text-[var(--lu-gold-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_20px_rgba(0,0,0,0.35)] sm:text-4xl">
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

      {/* seats: filled + waiting placeholders up to the cap */}
      <div>
        <div className="mb-2 flex items-center justify-between px-0.5 text-xs">
          <span className="text-[var(--lu-tan)]">اللاعبون</span>
          <span className="num font-bold text-[var(--lu-cream)]">
            {filled} / {state.maxPlayers}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

      {/* start (creator) / waiting state */}
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

/**
 * Winner-announcement overlay — Link Up's result-screen style for Top Ten: three top
 * controls (جولة جديدة / إغلاق الطاولة / خروج) with a ready-vote + auto-start countdown,
 * over a per-player breakdown (points + the cards each player revealed). The creator
 * also gets Close; a clean end offers New Round, an abandoned table only Exit.
 */
function TenWinner({
  state,
  meId,
  result,
  abandoned,
  onNewRound,
  onClose,
  onExit,
}: {
  state: TtStateView;
  meId: string;
  result: RoundSnapshot | null;
  abandoned: boolean;
  onNewRound: () => void;
  onClose?: () => void;
  onExit: () => void;
}) {
  useEffect(() => {
    ttSound.play(abandoned ? "lock" : "win");
  }, [abandoned]);

  const standings = result?.standings ?? [...state.seats].map(seatToStanding);
  const seats = result?.seats ?? state.seats;
  const cards = result?.cards ?? [];
  const nr = state.newRoundRequest;
  const mySeat = state.seats.find((s) => s.userId === meId);
  const youReady = !!(nr && mySeat && nr.readySeats.includes(mySeat.seat));
  const canNewRound = !abandoned;
  const showClose = !!onClose && !abandoned;
  const cols = (canNewRound ? 1 : 0) + (showClose ? 1 : 0) + 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex justify-center overflow-y-auto bg-[var(--lu-abyss)]/95 p-3 backdrop-blur-md sm:p-6"
    >
      <div className="my-auto w-full max-w-md space-y-3">
        {/* top controls + ready vote (mirrors Link Up's result-screen controls) */}
        <div className="space-y-2">
          {canNewRound && nr ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-[var(--lu-tan)]">
                الاستعداد للجولة: <span className="num font-bold text-[var(--lu-cream)]">{nr.readySeats.length}</span>
                /<span className="num">{Math.max(1, nr.needed)}</span>
              </span>
              {nr.deadlineTs ? (
                <span className="lu-chip inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/40">
                  تبدأ خلال <NewRoundCountdown deadlineTs={nr.deadlineTs} /> ث
                </span>
              ) : null}
            </div>
          ) : null}
          <div className={cn("grid gap-2", cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1")}>
            {canNewRound ? (
              <TenResultAction glyph={youReady ? "✓" : "▶"} label={youReady ? "جاهز" : "جولة جديدة"} variant="primary" disabled={youReady} onClick={onNewRound} />
            ) : null}
            {showClose ? <TenResultAction glyph="✕" label="إغلاق الطاولة" variant="destructive" onClick={onClose!} /> : null}
            <TenResultAction glyph="⮐" label="خروج" variant="neutral" onClick={onExit} />
          </div>
        </div>

        {/* the announcement body */}
        <RoundResultView standings={standings} seats={seats} cards={cards} meId={meId} abandoned={abandoned} />
      </div>
    </motion.div>
  );
}

function NewRoundCountdown({ deadlineTs }: { deadlineTs: number }) {
  const ms = useRemainingMs(deadlineTs) ?? 0;
  return <span className="num text-base font-black">{Math.max(0, Math.ceil(ms / 1000))}</span>;
}

function TenResultAction({
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
    destructive: "border border-[#d9694f]/50 bg-[#d9694f]/15 text-[#d9694f]",
    neutral: "lu-frame text-[var(--lu-cream)]",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 text-sm font-bold transition disabled:opacity-60", styles[variant])}
    >
      <span aria-hidden className="text-lg leading-none">{glyph}</span>
      {label}
    </button>
  );
}

/** Per-player breakdown for a finished round — winner highlighted (gold), then the
 *  rest, each showing points + the rank cards they revealed. Reused by the live winner
 *  overlay and each expanded round in the leave-summary. */
function RoundResultView({
  standings,
  seats,
  cards,
  meId,
  abandoned,
}: {
  standings: TtStandingRow[];
  seats: TtStateView["seats"];
  cards: TtStateView["cards"];
  meId: string;
  abandoned: boolean;
}) {
  const seatOf = (seat: number) => seats.find((s) => s.seat === seat);
  const revealsBy = (seat: number) => cards.filter((c) => c.revealed && c.bySeat === seat).sort((a, b) => b.rank - a.rank);
  const winner = !abandoned && standings.length > 0 && !standings[1]?.tiedWithPrev ? standings[0] : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-1">
        <span className="grid size-12 place-items-center rounded-full border border-[var(--lu-gold-1)]/50 bg-[var(--lu-gold-2)]/10 text-2xl">
          {abandoned ? "🚪" : winner ? "🏆" : "🤝"}
        </span>
        <div className="lu-gold-text lu-gold-title text-lg font-black">
          {abandoned ? "انتهت المباراة" : winner ? "الفائز" : "تعادل"}
        </div>
      </div>
      {winner ? (
        <PlayerResultRow row={winner} seat={seatOf(winner.seat)} reveals={revealsBy(winner.seat)} meId={meId} tone="gold" />
      ) : null}
      <div className="space-y-1.5">
        {standings
          .filter((s) => !winner || s.userId !== winner.userId)
          .map((s) => (
            <PlayerResultRow key={s.userId} row={s} seat={seatOf(s.seat)} reveals={revealsBy(s.seat)} meId={meId} tone="plain" />
          ))}
      </div>
    </div>
  );
}

function PlayerResultRow({
  row,
  seat,
  reveals,
  meId,
  tone,
}: {
  row: TtStandingRow;
  seat: TtStateView["seats"][number] | undefined;
  reveals: TtStateView["cards"];
  meId: string;
  tone: "gold" | "plain";
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border p-3", tone === "gold" ? "border-[var(--lu-gold-1)]/45 bg-gradient-to-b from-[var(--lu-gold-2)]/15 to-transparent" : "lu-frame")}>
      <div className="flex items-center gap-2.5">
        <SeatAvatar playerNumber={seat?.playerNumber ?? 0} seed={seat?.username ?? row.username} size={36} sizeClass="size-9" className="ring-1 ring-white/15" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-[var(--lu-cream)]">
            {row.userId === meId ? "أنت" : row.username}
            {row.tiedWithPrev ? " (تعادل)" : ""}
          </div>
          <div className="num text-[0.7rem] text-[var(--lu-tan)]">المركز #{row.place}</div>
        </div>
        <span className="num text-xl font-black text-[var(--gold)]">{row.points}</span>
      </div>
      {reveals.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {reveals.map((c) => (
            <span key={c.rank} className="inline-flex items-center gap-1 rounded-full border border-[var(--lu-gold-1)]/30 bg-[var(--lu-gold-2)]/[0.06] px-2 py-0.5 text-[0.66rem] font-bold text-[var(--lu-gold-1)]">
              <span className="num">#{c.rank}</span>
              {c.player ? <span className="text-[var(--lu-cream)]/80">{c.player.nameAr}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Leave-summary — like Link Up's: a collapsed card per round played this session,
 *  each expanding to that round's full breakdown. X returns to the lobby. */
function TenTableSummary({ rounds, meId, onClose }: { rounds: RoundSnapshot[]; meId: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-[var(--lu-abyss)]/95 p-3 backdrop-blur-md sm:p-6"
    >
      <div className="my-auto w-full max-w-md space-y-3">
        <div className="lu-frame flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="lu-gold-text lu-gold-title text-base font-black">ملخص الطاولة</span>
            <span className="num text-[0.7rem] text-[var(--lu-tan)]">
              {rounds.length} {rounds.length === 1 ? "جولة" : "جولات"}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--lu-gold-1)]/25 bg-black/40 text-lg text-[var(--lu-cream)]/85">
            ✕
          </button>
        </div>
        <div className="space-y-2">
          {rounds.map((rd) => (
            <SummaryRoundCard key={rd.round} rd={rd} meId={meId} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function SummaryRoundCard({ rd, meId }: { rd: RoundSnapshot; meId: string }) {
  const [open, setOpen] = useState(false);
  const winner = rd.standings[0];
  return (
    <div className="lu-frame overflow-hidden rounded-2xl">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3">
        <span className="font-bold text-[var(--lu-cream)]">الجولة {rd.round}</span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--lu-tan)]">
          الفائز: {winner ? (winner.userId === meId ? "أنت" : winner.username) : "—"}
          <span className="text-[0.6rem]">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/10 p-3">
          <RoundResultView standings={rd.standings} seats={rd.seats} cards={rd.cards} meId={meId} abandoned={false} />
        </div>
      ) : null}
    </div>
  );
}
