"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectGame, type GameConnection } from "./realtime";
import { applyStateSync, INITIAL_VIEW, type TableView } from "./tableView";
import { ANIMATIONS_ENABLED } from "./anim";
import { fxBus } from "./fx-bus";

export type { TableView } from "./tableView";

/**
 * Live table state. The server emits granular events (Section 12); this hook
 * folds them into one view model the table renders. The server remains the only
 * referee — this is presentation state, re-synced from `state:sync` on connect.
 * The pure folding/selectors live in ./tableView so they're unit-testable.
 */
export function useGameSocket(token: string, inviteCode: string) {
  const [view, setView] = useState<TableView>(INITIAL_VIEW);
  const connRef = useRef<GameConnection | null>(null);

  // A stable notice pusher kept in a ref so the connect effect runs once per
  // (token, room).
  const noticeIdRef = useRef(0);
  const connectedBeforeRef = useRef(false);
  const pushNoticeRef = useRef<(text: string, kind: "action" | "system") => void>(() => {});
  pushNoticeRef.current = (text, kind) => {
    const id = ++noticeIdRef.current;
    setView((v) => ({ ...v, notices: [...v.notices, { id, text, kind }].slice(-5) }));
    setTimeout(
      () => setView((v) => ({ ...v, notices: v.notices.filter((n) => n.id !== id) })),
      3500,
    );
  };
  useEffect(() => {
    const conn = connectGame(token, {
      onConnect: () => {
        // A6: a second+ connect is a reconnect — tell the player.
        if (connectedBeforeRef.current) {
          pushNoticeRef.current("تمت إعادة الاتصال بالطاولة", "system");
        }
        connectedBeforeRef.current = true;
        setView((v) => ({ ...v, connected: true }));
        conn.join(inviteCode);
      },
      onDisconnect: () => setView((v) => ({ ...v, connected: false })),
      // Preserve our own seat: a broadcast sync (another player joining) carries
      // yourSeat=null and must not erase the seat we already hold (PROBLEM 1).
      // A state:sync means we're seated in the room — clear any password prompt.
      onState: (state) => setView((v) => applyStateSync(v, state)),
      onDealt: (p) => setView((v) => ({ ...v, hole: p.holeCards })),
      onPhase: (p) =>
        setView((v) =>
          v.state
            ? {
                ...v,
                state: {
                  ...v.state,
                  phase: p.phase,
                  communityCards: p.communityCards,
                  currentBet: 0,
                  // Mirror the server: a new street resets each seat's
                  // committed-this-round to 0 (clearRoundCommitments). Without
                  // this the client's owed math drifts and a legal CHECK can be
                  // wrongly blocked. committedTotal (whole-hand) is preserved.
                  players: v.state.players.map((pl) => ({ ...pl, committedThisRound: 0 })),
                },
              }
            : v,
        ),
      onTurn: (p) =>
        setView((v) =>
          v.state
            ? {
                ...v,
                // The acting seat's fold-forfeit; it's the local player's own when
                // it becomes their turn (the fold confirm only shows then).
                foldForfeit: p.foldForfeit,
                state: { ...v.state, currentTurnSeat: p.seat, turnDeadlineTs: p.deadlineTs },
              }
            : v,
        ),
      onBet: (p) => {
        setView((v) => {
          if (!v.state) return v;
          const players = v.state.players.map((pl) =>
            pl.seat === p.seat
              ? {
                  ...pl,
                  committedThisRound: pl.committedThisRound + p.amount,
                  committedTotal: pl.committedTotal + p.amount,
                  status:
                    p.action === "ALLIN"
                      ? ("ALLIN" as const)
                      : p.action === "FOLD"
                        ? ("FOLDED" as const)
                        : pl.status,
                }
              : pl,
          );
          return {
            ...v,
            state: { ...v.state, players, pot: p.pot, pots: p.pots, currentBet: p.currentBet },
          };
        });
        // The action now transforms the acting OPPONENT's seat (see OpponentSeat's
        // action overlay) instead of a center-table toast. Emitted for the four
        // wager actions only; always emitted (it is the primary feedback now) —
        // only opponent seats render it, and reduced-motion is handled by framer.
        if (
          p.action === "CHECK" ||
          p.action === "CALL" ||
          p.action === "RAISE" ||
          p.action === "ALLIN"
        ) {
          fxBus.emit({ type: "action", seat: p.seat, action: p.action });
        }
        // Visual-only chip / all-in FX (state already applied above). No-op when
        // nobody is listening (animations off). Never goes to the server.
        if (ANIMATIONS_ENABLED) {
          if (p.action === "ALLIN") fxBus.emit({ type: "allin", seat: p.seat });
          if (p.action !== "FOLD" && p.action !== "CHECK") {
            fxBus.emit({ type: "bet", seat: p.seat, amount: p.amount, action: p.action });
          }
        }
      },
      onFolded: (p) =>
        setView((v) =>
          v.state
            ? {
                ...v,
                state: {
                  ...v.state,
                  players: v.state.players.map((pl) =>
                    pl.seat === p.seat ? { ...pl, status: "FOLDED" } : pl,
                  ),
                },
              }
            : v,
        ),
      onResult: (result) =>
        setView((v) => {
          const mine = v.state
            ? result.results.find((r) => r.seat === v.state!.yourSeat)
            : undefined;
          // Snapshot this completed round for the end-of-session table summary,
          // numbered by the order the player took part (oldest first).
          const round = {
            round: v.rounds.length + 1,
            result,
            players: v.state?.players ?? [],
            yourSeat: v.state?.yourSeat ?? null,
            bestRank: null,
          };
          return {
            ...v,
            result,
            rounds: [...v.rounds, round],
            // A7: keep the header balance authoritative — adopt the server's
            // finalBalance for our seat as the new base going into the next hand.
            balance: mine ? mine.finalBalance : v.balance,
            state: v.state ? { ...v.state, phase: "ENDED" } : v.state,
          };
        }),
      // Private per-seat winner-screen reveal: the local player's own best rank.
      // It arrives just AFTER the result, so also attach it to the round we just
      // pushed, so the summary replays the round exactly as it appeared.
      onBestRank: (p) =>
        setView((v) => ({
          ...v,
          bestRank: p,
          rounds:
            v.rounds.length > 0
              ? v.rounds.map((r, i) =>
                  i === v.rounds.length - 1 ? { ...r, bestRank: p } : r,
                )
              : v.rounds,
        })),
      // Feature #7: a new hand began in the same room — clear the previous
      // board/result, adopt the rotated dealer, and wait for the private deal.
      onHandStarted: (p) =>
        setView((v) => ({
          ...v,
          result: null,
          bestRank: null,
          hole: [],
          waiting: null,
          roundReady: null,
          state: v.state
            ? {
                ...v.state,
                phase: "PREFLOP",
                status: "IN_PROGRESS",
                players: p.players,
                communityCards: [],
                pot: p.pot,
                pots: [{ amount: p.pot, eligibleSeats: [] }],
                currentBet: p.currentBet,
                dealerSeat: p.dealerSeat,
                currentTurnSeat: null,
                turnDeadlineTs: null,
              }
            : v.state,
        })),
      // Winner-screen ready-check: who's pressed "New Round" + the auto-advance
      // deadline. Server-authoritative; drives the overlay's ready UI/countdown.
      onRoundStatus: (p) =>
        setView((v) => ({
          ...v,
          roundReady: { readySeats: p.readySeats, total: p.totalHumans, deadlineTs: p.deadlineTs },
        })),
      // The room parked between hands, open: NEED_PLAYERS (can't afford the
      // ante) or NOT_READY (grace ran out with nobody continuing) — the banner
      // wording follows the reason.
      onSessionWaiting: (p) =>
        setView((v) => ({
          ...v,
          result: null,
          bestRank: null,
          hole: [],
          waiting: p.reason,
          roundReady: null,
          state: v.state
            ? { ...v.state, phase: "LOBBY", status: "LOBBY", currentTurnSeat: null }
            : v.state,
        })),
      // A6: an opponent disconnected/left — transient banner.
      onPlayerLeft: (p) =>
        pushNoticeRef.current(`${p.username || `مقعد ${p.seat}`} غادر الطاولة`, "system"),
      // The room was closed (host or auto-empty): mark it so the table redirects.
      onRoomClosed: (p) => setView((v) => ({ ...v, closed: p.reason })),
      onError: (e) => {
        // Quick Play "join after the current round": a calm system notice, not a
        // fatal error — the player is spectating until the next hand seats them.
        if (e.code === "SPECTATING") {
          pushNoticeRef.current(e.messageAr, "system");
          return;
        }
        setView((v) => ({ ...v, error: e.messageAr }));
      },
      // Inactivity logout / invalid token: the session is gone — flag it so the
      // table redirects to /login (retrying the handshake can't recover it).
      onAuthExpired: () => setView((v) => ({ ...v, authExpired: true })),
    });
    connRef.current = conn;
    return () => conn.disconnect();
    // Connect once per (token, room).
  }, [token, inviteCode]);

  const start = useCallback(() => connRef.current?.start(), []);
  const nextHand = useCallback(() => connRef.current?.nextHand(), []);
  const ready = useCallback(() => connRef.current?.ready(), []);
  const closeTable = useCallback(() => connRef.current?.closeTable(), []);
  const leave = useCallback(() => connRef.current?.leave(), []);
  const placeAction = useCallback(
    (type: string, amount?: number) => connRef.current?.placeAction(type, amount),
    [],
  );
  const clearError = useCallback(() => setView((v) => ({ ...v, error: null })), []);

  return {
    view,
    start,
    nextHand,
    ready,
    closeTable,
    leave,
    placeAction,
    clearError,
  };
}
