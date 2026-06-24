import { io, type Socket } from "socket.io-client";
import { sound } from "./sound";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type BestRankPayload,
  type BetPlacedPayload,
  type GameDealtPayload,
  type GameResultPayload,
  type HandStartedPayload,
  type PhaseChangedPayload,
  type PlayerFoldedPayload,
  type PlayerLeftPayload,
  type QueueMatchedPayload,
  type QueueStatePayload,
  type RoomClosedPayload,
  type RoundStatusPayload,
  type SessionWaitingPayload,
  type StateSyncPayload,
  type TurnChangedPayload,
} from "@fp/shared";

/**
 * Typed Socket.IO client for the game server (Section 12). The handshake carries
 * a signed session token (minted server-side by the web from the verified
 * Auth.js session); the client never sends a raw userId. The game server derives
 * the identity from the token's signature.
 */

export interface GameHandlers {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onState?: (p: StateSyncPayload) => void;
  onDealt?: (p: GameDealtPayload) => void;
  onPhase?: (p: PhaseChangedPayload) => void;
  onTurn?: (p: TurnChangedPayload) => void;
  onBet?: (p: BetPlacedPayload) => void;
  onFolded?: (p: PlayerFoldedPayload) => void;
  onResult?: (p: GameResultPayload) => void;
  onBestRank?: (p: BestRankPayload) => void;
  onHandStarted?: (p: HandStartedPayload) => void;
  onRoundStatus?: (p: RoundStatusPayload) => void;
  onSessionWaiting?: (p: SessionWaitingPayload) => void;
  onPlayerLeft?: (p: PlayerLeftPayload) => void;
  onRoomClosed?: (p: RoomClosedPayload) => void;
  onError?: (p: { code: string; messageAr: string }) => void;
  /** The handshake was rejected because the session is gone (inactivity logout
   *  or an invalid/expired token). Retrying can't fix it — the caller should
   *  force re-authentication (send the user to /login). */
  onAuthExpired?: (reason: "SESSION_EXPIRED" | "UNAUTHENTICATED") => void;
}

export interface GameConnection {
  socket: Socket;
  join: (inviteCode: string) => void;
  start: () => void;
  nextHand: () => void;
  /** Winner screen: mark this player ready for the next round (round:ready). */
  ready: () => void;
  closeTable: () => void;
  /** Leave the table without closing it (host role transfers if you're host). */
  leave: () => void;
  placeAction: (type: string, amount?: number) => void;
  disconnect: () => void;
}

const url = () =>
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:4000";

/** Map a handshake/connection failure to a localized, non-crashing message. */
function connectErrorMessage(reason: string): string {
  if (reason === "SESSION_EXPIRED") return "انتهت الجلسة، يُرجى تحديث الصفحة";
  if (reason === "UNAUTHENTICATED") return "الجلسة غير صالحة، يُرجى تسجيل الدخول من جديد";
  if (reason === "RATE_LIMITED") return "محاولات كثيرة، يُرجى المحاولة بعد قليل";
  return "تعذّر الاتصال بالخادم";
}

export function connectGame(token: string, handlers: GameHandlers): GameConnection {
  const socket = io(url(), { auth: { token }, withCredentials: true });

  // Backgrounding a tab (especially on mobile) can suspend the socket; when the
  // page returns to the foreground, nudge a reconnect so the player rejoins
  // promptly. The server holds their seat for a grace window, so this restores the
  // table seamlessly. Socket.IO also auto-reconnects on its own — this just makes
  // resume immediate instead of waiting for the next backoff tick.
  const onVisible = () => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      !socket.connected
    ) {
      socket.connect();
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

  const bind = <T>(event: string, fn?: (p: T) => void) => {
    if (fn) socket.on(event, (p: unknown) => fn(p as T));
  };

  socket.on("connect", () => handlers.onConnect?.());
  socket.on("disconnect", () => handlers.onDisconnect?.());
  // Handshake rejection (bad/expired token, server down) — fail cleanly.
  socket.on("connect_error", (err: Error) => {
    // A gone session (inactivity logout / invalid token) can't be fixed by
    // retrying — stop reconnecting and let the caller force re-authentication.
    if (err.message === "SESSION_EXPIRED" || err.message === "UNAUTHENTICATED") {
      socket.disconnect();
      handlers.onAuthExpired?.(err.message);
    }
    handlers.onError?.({
      code: "CONNECT_ERROR",
      messageAr: connectErrorMessage(err.message),
    });
  });
  bind(SERVER_EVENTS.stateSync, handlers.onState);
  bind(SERVER_EVENTS.gameDealt, handlers.onDealt);
  bind(SERVER_EVENTS.phaseChanged, handlers.onPhase);
  bind(SERVER_EVENTS.turnChanged, handlers.onTurn);
  bind(SERVER_EVENTS.betPlaced, handlers.onBet);
  bind(SERVER_EVENTS.playerFolded, handlers.onFolded);
  bind(SERVER_EVENTS.gameResult, handlers.onResult);
  bind(SERVER_EVENTS.bestRank, handlers.onBestRank);
  bind(SERVER_EVENTS.handStarted, handlers.onHandStarted);
  bind(SERVER_EVENTS.roundStatus, handlers.onRoundStatus);
  bind(SERVER_EVENTS.sessionWaiting, handlers.onSessionWaiting);
  bind(SERVER_EVENTS.playerLeft, handlers.onPlayerLeft);
  bind(SERVER_EVENTS.roomClosed, handlers.onRoomClosed);
  bind(SERVER_EVENTS.error, handlers.onError);

  // -------------------------------------------------------------- sound effects
  // Audio reacts to the SAME server events as separate listeners (Socket.IO
  // allows many per event), so it stays fully decoupled from the React view
  // handlers above. `yourSeat` is tracked from state:sync so we can distinguish
  // "your turn" from an opponent's. All playback is a client no-op until the
  // user's first gesture unlocks audio (see sound.ts / GameTable).
  let yourSeat: number | null = null;
  let warnTimer: ReturnType<typeof setTimeout> | null = null;
  const clearWarn = () => {
    if (warnTimer) {
      clearTimeout(warnTimer);
      warnTimer = null;
    }
  };
  socket.on(SERVER_EVENTS.stateSync, (p: StateSyncPayload) => {
    if (p.yourSeat != null) yourSeat = p.yourSeat;
  });
  socket.on(SERVER_EVENTS.gameDealt, () => sound.play("deal"));
  socket.on(SERVER_EVENTS.handStarted, () => sound.play("shuffle"));
  socket.on(SERVER_EVENTS.phaseChanged, (p: PhaseChangedPayload) => {
    if (p.phase === "FLOP" || p.phase === "TURN" || p.phase === "RIVER") sound.play("flip");
  });
  socket.on(SERVER_EVENTS.turnChanged, (p: TurnChangedPayload) => {
    clearWarn();
    if (yourSeat != null && p.seat === yourSeat) {
      sound.play("your-turn");
      // Warn ~5s before the turn deadline (only while it's still your turn).
      const lead = p.deadlineTs - 5000 - Date.now();
      if (lead > 0) warnTimer = setTimeout(() => sound.play("timer-warning"), lead);
    }
  });
  socket.on(SERVER_EVENTS.betPlaced, (p: BetPlacedPayload) => {
    if (p.action === "CHECK") sound.play("check");
    else if (p.action === "ALLIN") sound.play("allin");
    else if (p.action !== "FOLD") sound.play("chip"); // BET / CALL / RAISE
  });
  socket.on(SERVER_EVENTS.playerFolded, () => sound.play("fold"));
  socket.on(SERVER_EVENTS.gameResult, (p: GameResultPayload) => {
    clearWarn();
    // Distinct cue per result card: no-winner (draw) → showdown; you won → win;
    // you were in the hand and lost → lose. `yourDelta` is always 0 on the wire
    // (the client recomputes balance from `results`), so derive the cue from the
    // results instead.
    const anyWinner = p.results.some((r) => r.outcome === "WIN" || r.outcome === "SPLIT");
    const mine = yourSeat != null ? p.results.find((r) => r.seat === yourSeat) : undefined;
    if (!anyWinner) sound.play("showdown");
    else if (mine && (mine.outcome === "WIN" || mine.outcome === "SPLIT")) sound.play("win");
    else if (mine && mine.outcome === "LOSE") sound.play("lose");
  });
  socket.on(SERVER_EVENTS.playerLeft, () => sound.play("notify"));
  socket.on("disconnect", clearWarn);

  return {
    socket,
    join: (inviteCode) => socket.emit(CLIENT_EVENTS.roomJoin, { inviteCode }),
    start: () => socket.emit(CLIENT_EVENTS.gameStart, {}),
    nextHand: () => socket.emit(CLIENT_EVENTS.nextHand, {}),
    ready: () => socket.emit(CLIENT_EVENTS.roundReady, {}),
    closeTable: () => socket.emit(CLIENT_EVENTS.roomClose, {}),
    leave: () => socket.emit(CLIENT_EVENTS.roomLeave, {}),
    placeAction: (type, amount) =>
      socket.emit(CLIENT_EVENTS.actionPlace, { type, amount }),
    disconnect: () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      socket.disconnect();
    },
  };
}

// ---------------------------------------------------------------------------
// Quick Play queue — a lightweight identity-only connection (no table). Joins a
// tier's matchmaking queue and listens for the waiting-lobby state + the match.
// ---------------------------------------------------------------------------

export interface QueueHandlers {
  onConnect?: () => void;
  onState?: (p: QueueStatePayload) => void;
  onMatched?: (p: QueueMatchedPayload) => void;
  onError?: (p: { code: string; messageAr: string }) => void;
}

export interface QueueConnection {
  joinQueue: (difficulty: string) => void;
  leaveQueue: () => void;
  disconnect: () => void;
}

export function connectQueue(token: string, handlers: QueueHandlers): QueueConnection {
  const socket = io(url(), { auth: { token }, withCredentials: true });

  socket.on("connect", () => handlers.onConnect?.());
  socket.on("connect_error", (err: Error) =>
    handlers.onError?.({ code: "CONNECT_ERROR", messageAr: connectErrorMessage(err.message) }),
  );
  socket.on(SERVER_EVENTS.queueState, (p: unknown) => handlers.onState?.(p as QueueStatePayload));
  socket.on(SERVER_EVENTS.queueMatched, (p: unknown) =>
    handlers.onMatched?.(p as QueueMatchedPayload),
  );
  socket.on(SERVER_EVENTS.error, (p: unknown) =>
    handlers.onError?.(p as { code: string; messageAr: string }),
  );

  return {
    joinQueue: (difficulty) => socket.emit(CLIENT_EVENTS.queueJoin, { difficulty }),
    leaveQueue: () => socket.emit(CLIENT_EVENTS.queueLeave, {}),
    disconnect: () => socket.disconnect(),
  };
}
