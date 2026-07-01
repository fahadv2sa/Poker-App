import { io, type Socket } from "socket.io-client";
import {
  TT_CLIENT_EVENTS,
  TT_SERVER_EVENTS,
  type TtDifficulty,
  type TtMatchEndedEvent,
  type TtQueueStateEvent,
  type TtRevealEvent,
  type TtRoundEndedEvent,
  type TtStateView,
} from "@fb/shared";

/**
 * Typed Socket.IO client for the Top Ten server. The handshake carries the signed
 * realtime token minted server-side from the verified Auth.js session.
 */
export interface TtHandlers {
  onConnect?: () => void;
  onState?: (s: TtStateView) => void;
  onReveal?: (r: TtRevealEvent) => void;
  onRoundEnded?: (r: TtRoundEndedEvent) => void;
  onMatchEnded?: (m: TtMatchEndedEvent) => void;
  onQueueState?: (q: TtQueueStateEvent) => void;
  onQueueMatched?: (p: { matchId: string }) => void;
  onToast?: (p: { text: string }) => void;
  /** The creator closed the table — bounce back to the lobby with a notice. */
  onTableClosed?: (p: { text?: string }) => void;
  onError?: (msg: string) => void;
  onAuthExpired?: () => void;
}

export interface TtCreateOptions {
  difficulty: TtDifficulty;
  roundTimerSec?: number;
  isPrivate?: boolean;
  roomName?: string;
  maxPlayers?: number;
}

/** Server ack for create/join — either the match id or a coded error. */
export type TtJoinAck = { matchId?: string; inviteCode?: string | null; error?: string };

export interface TtConnection {
  socket: Socket;
  create: (opts: TtCreateOptions, ack?: (r: TtJoinAck) => void) => void;
  join: (inviteCode: string, ack?: (r: TtJoinAck) => void) => void;
  start: () => void;
  guess: (playerId: string) => void;
  requestEndRound: () => void;
  voteEndRound: (accept: boolean) => void;
  /** Ready up for a new round at the same table after a round ends. */
  newRound: () => void;
  queueJoin: (difficulty: TtDifficulty) => void;
  queueLeave: () => void;
  leave: () => void;
  close: () => void;
  disconnect: () => void;
}

const url = () => process.env.NEXT_PUBLIC_TOP10_SERVER_URL ?? "http://localhost:4100";

export function connectTopTen(token: string, handlers: TtHandlers): TtConnection {
  const socket: Socket = io(url(), { auth: { token }, withCredentials: true });

  // Backgrounding a tab (especially on mobile — peeking a notification) suspends the
  // socket; on foreground, nudge an immediate reconnect so the player rejoins their
  // ongoing game promptly. The server holds the seat for a grace window and resyncs on
  // connect, so this restores the table seamlessly. Mirrors Link Up's connectGame.
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
  socket.on(TT_SERVER_EVENTS.state, (p: unknown) => handlers.onState?.(p as TtStateView));
  socket.on(TT_SERVER_EVENTS.reveal, (p: unknown) => handlers.onReveal?.(p as TtRevealEvent));
  socket.on(TT_SERVER_EVENTS.roundEnded, (p: unknown) => handlers.onRoundEnded?.(p as TtRoundEndedEvent));
  socket.on(TT_SERVER_EVENTS.matchEnded, (p: unknown) => handlers.onMatchEnded?.(p as TtMatchEndedEvent));
  socket.on(TT_SERVER_EVENTS.queueState, (p: unknown) => handlers.onQueueState?.(p as TtQueueStateEvent));
  socket.on(TT_SERVER_EVENTS.queueMatched, (p: unknown) => handlers.onQueueMatched?.(p as { matchId: string }));
  socket.on(TT_SERVER_EVENTS.toast, (p: unknown) => handlers.onToast?.(p as { text: string }));
  socket.on(TT_SERVER_EVENTS.tableClosed, (p: unknown) => handlers.onTableClosed?.(p as { text?: string }));
  socket.on(TT_SERVER_EVENTS.error, (p: unknown) => handlers.onError?.(String((p as { messageAr?: string })?.messageAr ?? "خطأ")));

  return {
    socket,
    create: (opts, ack) => socket.emit(TT_CLIENT_EVENTS.create, opts, ack),
    join: (inviteCode, ack) => socket.emit(TT_CLIENT_EVENTS.join, { inviteCode }, ack),
    start: () => socket.emit(TT_CLIENT_EVENTS.start, {}),
    guess: (playerId) => socket.emit(TT_CLIENT_EVENTS.guess, { playerId }),
    requestEndRound: () => socket.emit(TT_CLIENT_EVENTS.endRoundRequest, {}),
    voteEndRound: (accept) => socket.emit(TT_CLIENT_EVENTS.endRoundVote, { accept }),
    newRound: () => socket.emit(TT_CLIENT_EVENTS.newRound, {}),
    queueJoin: (difficulty) => socket.emit(TT_CLIENT_EVENTS.queueJoin, { difficulty }),
    queueLeave: () => socket.emit(TT_CLIENT_EVENTS.queueLeave, {}),
    leave: () => socket.emit(TT_CLIENT_EVENTS.leave, {}),
    close: () => socket.emit(TT_CLIENT_EVENTS.close, {}),
    disconnect: () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      socket.disconnect();
    },
  };
}
