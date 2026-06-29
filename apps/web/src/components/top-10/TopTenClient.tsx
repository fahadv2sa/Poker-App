"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Atmosphere, BackIcon, BoltIcon, GoldButton, GoldGradientDefs, GoldTitle, Panel, cn } from "@fb/top-10-ui";
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
  const [view, setView] = useState<View>("lobby");
  const [state, setState] = useState<TtStateView | null>(null);
  const [queue, setQueue] = useState<{ waiting: number; needed: number; countdownSec: number | null } | null>(null);
  const [endStandings, setEndStandings] = useState<TtStandingRow[] | null>(null);
  const [roundBanner, setRoundBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ event: TtRevealEvent; id: number } | null>(null);
  const revealSeq = useRef(0);

  useEffect(() => {
    const conn = connectTopTen(token, {
      onConnect: () => {
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
        setState(s);
        if (s.status === "IN_PROGRESS" || s.status === "LOBBY") setView("match");
        if (s.status === "ENDED" || s.status === "ABANDONED") setView("match");
      },
      onQueueState: (q) => {
        setQueue({ waiting: q.waiting, needed: q.needed, countdownSec: q.countdownSec });
        // defensive: if a queue update arrives while still on the lobby, show the queue
        setView((v) => (v === "lobby" ? "queue" : v));
      },
      onQueueMatched: () => setView("match"),
      onReveal: (r) => setReveal({ event: r, id: ++revealSeq.current }),
      onRoundEnded: (r) => {
        setRoundBanner(`انتهت الجولة ${r.roundNo} — ${reasonAr(r.reason)}`);
        setTimeout(() => setRoundBanner(null), 4000);
      },
      onMatchEnded: (m) => setEndStandings(m.standings),
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
    setEndStandings(null);
    setQueue(null);
    setView("lobby");
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
            conn()?.queueJoin(d);
            setView("queue"); // show the filling queue immediately (like Link Up)
          }}
        />
      )}
      {view === "queue" && (
        <QueueView
          queue={queue}
          onCancel={() => {
            conn()?.queueLeave();
            setQueue(null);
            setView("lobby");
          }}
        />
      )}
      {view === "match" && state && (
        <MatchView
          state={state}
          me={me}
          endStandings={endStandings}
          roundBanner={roundBanner}
          reveal={reveal}
          conn={conn}
          onLeave={backToLobby}
        />
      )}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-black/80 px-5 py-2 text-[var(--lu-cream)] shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

function reasonAr(r: string): string {
  return r === "ALL_REVEALED"
    ? "اكتملت القائمة"
    : r === "UNANIMOUS_END"
      ? "اتفاق على الإنهاء"
      : r === "TIMER"
        ? "انتهى وقت الجولة"
        : "انسحاب لاعب";
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
    <div className="flex flex-col gap-3 fade-rise">
      <p className="px-1 text-sm text-[var(--lu-tan)]">اختر المستوى وابدأ فورًا — تُملأ المقاعد بالبوتات عند الحاجة.</p>
      {TT_DIFFICULTIES.map((d) => (
        <button
          key={d}
          onClick={() => onJoin(d)}
          className="lu-btn lu-frame group flex items-center justify-between rounded-2xl px-5 py-4 text-right"
        >
          <div>
            <div className="text-xl font-black lu-gold-text">{DIFF_AR[d]}</div>
            <div className="text-xs text-[var(--lu-tan)]">{DIFF_SUB[d]}</div>
          </div>
          <span className="lu-chip grid size-11 place-items-center rounded-xl text-lg font-black text-[var(--gold)] ring-1 ring-[var(--lu-gold-1)]/30 group-hover:ring-[var(--lu-ember-glow)]/60">
            ▶
          </span>
        </button>
      ))}
      <div className="mt-1 flex gap-2">
        <a href="/games/top-10/create-room" className="lu-btn lu-chip flex-1 rounded-xl py-2.5 text-center text-sm font-bold lu-gold-text">
          إنشاء غرفة
        </a>
        <a href="/games/top-10/rooms" className="lu-btn lu-chip flex-1 rounded-xl py-2.5 text-center text-sm font-bold lu-gold-text">
          دخول بكود
        </a>
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
  endStandings,
  roundBanner,
  reveal,
  conn,
  onLeave,
}: {
  state: TtStateView;
  me: { userId: string; username: string };
  endStandings: TtStandingRow[] | null;
  roundBanner: string | null;
  reveal: { event: TtRevealEvent; id: number } | null;
  conn: () => TtConnection | null;
  onLeave: () => void;
}) {
  const mySeat = useMemo(() => state.seats.find((s) => s.userId === me.userId), [state, me]);
  // Stable guess handler so the memoized PlayerSearch isn't re-created each render.
  const onPick = useCallback((id: string) => conn()?.guess(id), [conn]);

  if (endStandings || state.status === "ENDED" || state.status === "ABANDONED") {
    return <MatchOver standings={endStandings ?? state.seats.map(seatToStanding)} abandoned={state.status === "ABANDONED"} onLeave={onLeave} />;
  }

  if (state.status === "LOBBY") {
    return (
      <Panel className="fade-rise">
        <LobbyRoom state={state} me={me} conn={conn} onLeave={onLeave} />
      </Panel>
    );
  }

  // IN_PROGRESS — the immersive felt table (full-screen overlay). Reuses <TenTable>
  // verbatim with live socket state; the roundBanner toast rides above it.
  return (
    <>
      <TenTable
        state={state}
        meId={me.userId}
        nickname={mySeat?.username ?? me.username}
        reveal={reveal}
        onPick={onPick}
        onLeave={onLeave}
        onClose={state.createdByUserId === me.userId ? () => conn()?.close() : undefined}
        onRequestEndRound={() => conn()?.requestEndRound()}
        onVoteEndRound={(a) => conn()?.voteEndRound(a)}
      />
      {roundBanner ? (
        <div className="fixed inset-x-0 top-12 z-[90] mx-auto w-fit rounded-full bg-black/85 px-6 py-2 font-bold text-[var(--gold)] shadow-lg">
          {roundBanner}
        </div>
      ) : null}
    </>
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

function MatchOver({ standings, abandoned, onLeave }: { standings: TtStandingRow[]; abandoned: boolean; onLeave: () => void }) {
  useEffect(() => {
    if (!abandoned) ttSound.play("win");
  }, [abandoned]);
  return (
    <Panel className="flex flex-col items-center gap-4 py-8 text-center fade-rise">
      <GoldTitle className="text-3xl">{abandoned ? "انتهت المباراة" : "النتيجة النهائية"}</GoldTitle>
      <ol className="w-full max-w-md">
        {standings.map((s) => (
          <li key={s.userId} className="mb-2 flex items-center justify-between rounded-xl lu-frame px-4 py-3">
            <span className="font-bold text-[var(--lu-cream)]">
              <span className="num ml-2 text-[var(--gold)]">#{s.place}</span>
              {s.username}
              {s.tiedWithPrev ? " (تعادل)" : ""}
            </span>
            <span className="num text-lg font-bold text-[var(--gold)]">{s.points}</span>
          </li>
        ))}
      </ol>
      <GoldButton onClick={onLeave}>العودة للقائمة</GoldButton>
    </Panel>
  );
}
