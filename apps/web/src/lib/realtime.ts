import { io, type Socket } from "socket.io-client";
import { sound } from "./sound";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type BestRankPayload,
  type BetPlacedPayload,
  type ClaimReceivedPayload,
  type GameDealtPayload,
  type GameResultPayload,
  type HandStartedPayload,
  type PhaseChangedPayload,
  type PlayerFoldedPayload,
  type PlayerLeftPayload,
  type RoomClosedPayload,
  type SessionWaitingPayload,
  type ShowdownStartPayload,
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
  onShowdown?: (p: ShowdownStartPayload) => void;
  onClaimReceived?: (p: ClaimReceivedPayload) => void;
  onResult?: (p: GameResultPayload) => void;
  onBestRank?: (p: BestRankPayload) => void;
  onHandStarted?: (p: HandStartedPayload) => void;
  onSessionWaiting?: (p: SessionWaitingPayload) => void;
  onPlayerLeft?: (p: PlayerLeftPayload) => void;
  onRoomClosed?: (p: RoomClosedPayload) => void;
  onError?: (p: { code: string; messageAr: string }) => void;
}

export interface GameConnection {
  socket: Socket;
  join: (inviteCode: string, password?: string) => void;
  start: () => void;
  nextHand: () => void;
  closeTable: () => void;
  /** Leave the table without closing it (host role transfers if you're host). */
  leave: () => void;
  placeAction: (type: string, amount?: number) => void;
  selectClaim: (handRankId: string) => void;
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

  const bind = <T>(event: string, fn?: (p: T) => void) => {
    if (fn) socket.on(event, (p: unknown) => fn(p as T));
  };

  socket.on("connect", () => handlers.onConnect?.());
  socket.on("disconnect", () => handlers.onDisconnect?.());
  // Handshake rejection (bad/expired token, server down) — fail cleanly.
  socket.on("connect_error", (err: Error) =>
    handlers.onError?.({
      code: "CONNECT_ERROR",
      messageAr: connectErrorMessage(err.message),
    }),
  );
  bind(SERVER_EVENTS.stateSync, handlers.onState);
  bind(SERVER_EVENTS.gameDealt, handlers.onDealt);
  bind(SERVER_EVENTS.phaseChanged, handlers.onPhase);
  bind(SERVER_EVENTS.turnChanged, handlers.onTurn);
  bind(SERVER_EVENTS.betPlaced, handlers.onBet);
  bind(SERVER_EVENTS.playerFolded, handlers.onFolded);
  bind(SERVER_EVENTS.showdownStart, handlers.onShowdown);
  bind(SERVER_EVENTS.claimReceived, handlers.onClaimReceived);
  bind(SERVER_EVENTS.gameResult, handlers.onResult);
  bind(SERVER_EVENTS.bestRank, handlers.onBestRank);
  bind(SERVER_EVENTS.handStarted, handlers.onHandStarted);
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
  socket.on(SERVER_EVENTS.showdownStart, () => {
    clearWarn();
    sound.play("showdown");
  });
  socket.on(SERVER_EVENTS.claimReceived, () => sound.play("notify"));
  socket.on(SERVER_EVENTS.gameResult, (p: GameResultPayload) => {
    clearWarn();
    if (p.yourDelta > 0) sound.play("win");
    else if (p.yourDelta < 0) sound.play("lose");
  });
  socket.on(SERVER_EVENTS.playerLeft, () => sound.play("notify"));
  socket.on("disconnect", clearWarn);

  return {
    socket,
    join: (inviteCode, password) =>
      socket.emit(CLIENT_EVENTS.roomJoin, { inviteCode, password }),
    start: () => socket.emit(CLIENT_EVENTS.gameStart, {}),
    nextHand: () => socket.emit(CLIENT_EVENTS.nextHand, {}),
    closeTable: () => socket.emit(CLIENT_EVENTS.roomClose, {}),
    leave: () => socket.emit(CLIENT_EVENTS.roomLeave, {}),
    placeAction: (type, amount) =>
      socket.emit(CLIENT_EVENTS.actionPlace, { type, amount }),
    selectClaim: (handRankId) =>
      socket.emit(CLIENT_EVENTS.claimSelect, { handRankId }),
    disconnect: () => socket.disconnect(),
  };
}
