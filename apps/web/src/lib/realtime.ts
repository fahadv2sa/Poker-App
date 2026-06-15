import { io, type Socket } from "socket.io-client";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type BetPlacedPayload,
  type ClaimReceivedPayload,
  type GameDealtPayload,
  type GameResultPayload,
  type PhaseChangedPayload,
  type PlayerFoldedPayload,
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
  onError?: (p: { code: string; messageAr: string }) => void;
}

export interface GameConnection {
  socket: Socket;
  join: (inviteCode: string, password?: string) => void;
  start: () => void;
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
  bind(SERVER_EVENTS.error, handlers.onError);

  return {
    socket,
    join: (inviteCode, password) =>
      socket.emit(CLIENT_EVENTS.roomJoin, { inviteCode, password }),
    start: () => socket.emit(CLIENT_EVENTS.gameStart, {}),
    placeAction: (type, amount) =>
      socket.emit(CLIENT_EVENTS.actionPlace, { type, amount }),
    selectClaim: (handRankId) =>
      socket.emit(CLIENT_EVENTS.claimSelect, { handRankId }),
    disconnect: () => socket.disconnect(),
  };
}
