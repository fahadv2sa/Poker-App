import { io, type Socket } from "socket.io-client";
import {
  GP_CLIENT_EVENTS,
  GP_SERVER_EVENTS,
  type GpAskInput,
  type GpDifficulty,
  type GpMode,
  type GpQuestionView,
  type GpQueueStateEvent,
  type GpRevealEvent,
  type GpStandingRow,
  type GpStateView,
  type GpWrongGuessView,
} from "@fb/shared";

/**
 * Typed Socket.IO client for the Guess the Player server (mirrors
 * lib/top-10/socket.ts). The handshake carries the signed realtime token
 * minted server-side from the verified Auth.js session.
 */
export interface GpHandlers {
  onConnect?: () => void;
  onState?: (s: GpStateView) => void;
  onQuestion?: (q: GpQuestionView) => void;
  onWrongGuess?: (g: GpWrongGuessView) => void;
  onReveal?: (r: GpRevealEvent) => void;
  onRoundEnded?: (r: { reason: string; roundNo: number; standings: GpStandingRow[] }) => void;
  onMatchEnded?: (m: { standings: GpStandingRow[] }) => void;
  onPickConfirmed?: (p: { player: { id: string; name: string; nameAr: string | null } }) => void;
  onQueueState?: (q: GpQueueStateEvent) => void;
  onQueueMatched?: (p: { matchId: string }) => void;
  onToast?: (p: { text: string }) => void;
  onTableClosed?: (p: { text?: string }) => void;
  onAwayNotice?: (p: { seat: number; username: string }) => void;
  onError?: (msg: string) => void;
  onAuthExpired?: () => void;
}

export interface GpCreateOptions {
  mode: GpMode;
  difficulty?: GpDifficulty;
  isPrivate?: boolean;
  roomName?: string;
  maxPlayers?: number;
}

export type GpJoinAck = { matchId?: string; inviteCode?: string | null; error?: string };

export interface GpConnection {
  socket: Socket;
  create: (opts: GpCreateOptions, ack?: (r: GpJoinAck) => void) => void;
  join: (inviteCode: string, ack?: (r: GpJoinAck) => void) => void;
  start: () => void;
  pick: (playerId: string) => void;
  ask: (input: GpAskInput) => void;
  guess: (playerId: string) => void;
  newMatch: () => void;
  queueJoin: (difficulty: GpDifficulty) => void;
  queueLeave: () => void;
  leave: () => void;
  close: () => void;
  away: () => void;
  back: () => void;
  disconnect: () => void;
}

const url = () => process.env.NEXT_PUBLIC_GP_SERVER_URL ?? "http://localhost:4200";

export function connectGuessPlayer(token: string, handlers: GpHandlers): GpConnection {
  const socket: Socket = io(url(), { auth: { token }, withCredentials: true });

  // Foregrounding the tab nudges an immediate reconnect (the server holds the
  // seat for the grace window and resyncs on connect) — mirrors Top Ten.
  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible" && !socket.connected) {
      socket.connect();
    }
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  socket.on("connect", () => handlers.onConnect?.());
  socket.on("connect_error", (err: Error) => {
    if (err.message === "SESSION_EXPIRED" || err.message === "UNAUTHENTICATED") {
      socket.disconnect();
      handlers.onAuthExpired?.();
      return;
    }
    handlers.onError?.(err.message);
  });
  socket.on(GP_SERVER_EVENTS.state, (p: unknown) => handlers.onState?.(p as GpStateView));
  socket.on(GP_SERVER_EVENTS.question, (p: unknown) => handlers.onQuestion?.(p as GpQuestionView));
  socket.on(GP_SERVER_EVENTS.wrongGuess, (p: unknown) => handlers.onWrongGuess?.(p as GpWrongGuessView));
  socket.on(GP_SERVER_EVENTS.reveal, (p: unknown) => handlers.onReveal?.(p as GpRevealEvent));
  socket.on(GP_SERVER_EVENTS.roundEnded, (p: unknown) =>
    handlers.onRoundEnded?.(p as { reason: string; roundNo: number; standings: GpStandingRow[] }),
  );
  socket.on(GP_SERVER_EVENTS.matchEnded, (p: unknown) => handlers.onMatchEnded?.(p as { standings: GpStandingRow[] }));
  socket.on(GP_SERVER_EVENTS.pickConfirmed, (p: unknown) =>
    handlers.onPickConfirmed?.(p as { player: { id: string; name: string; nameAr: string | null } }),
  );
  socket.on(GP_SERVER_EVENTS.queueState, (p: unknown) => handlers.onQueueState?.(p as GpQueueStateEvent));
  socket.on(GP_SERVER_EVENTS.queueMatched, (p: unknown) => handlers.onQueueMatched?.(p as { matchId: string }));
  socket.on(GP_SERVER_EVENTS.toast, (p: unknown) => handlers.onToast?.(p as { text: string }));
  socket.on(GP_SERVER_EVENTS.tableClosed, (p: unknown) => handlers.onTableClosed?.(p as { text?: string }));
  socket.on(GP_SERVER_EVENTS.awayNotice, (p: unknown) => handlers.onAwayNotice?.(p as { seat: number; username: string }));
  socket.on(GP_SERVER_EVENTS.error, (p: unknown) => handlers.onError?.(String((p as { messageAr?: string })?.messageAr ?? "خطأ")));

  return {
    socket,
    create: (opts, ack) => socket.emit(GP_CLIENT_EVENTS.create, opts, ack),
    join: (inviteCode, ack) => socket.emit(GP_CLIENT_EVENTS.join, { inviteCode }, ack),
    start: () => socket.emit(GP_CLIENT_EVENTS.start, {}),
    pick: (playerId) => socket.emit(GP_CLIENT_EVENTS.pick, { playerId }),
    ask: (input) => socket.emit(GP_CLIENT_EVENTS.ask, input),
    guess: (playerId) => socket.emit(GP_CLIENT_EVENTS.guess, { playerId }),
    newMatch: () => socket.emit(GP_CLIENT_EVENTS.newMatch, {}),
    queueJoin: (difficulty) => socket.emit(GP_CLIENT_EVENTS.queueJoin, { difficulty }),
    queueLeave: () => socket.emit(GP_CLIENT_EVENTS.queueLeave, {}),
    leave: () => socket.emit(GP_CLIENT_EVENTS.leave, {}),
    close: () => socket.emit(GP_CLIENT_EVENTS.close, {}),
    away: () => socket.emit(GP_CLIENT_EVENTS.away, {}),
    back: () => socket.emit(GP_CLIENT_EVENTS.back, {}),
    disconnect: () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      socket.disconnect();
    },
  };
}
