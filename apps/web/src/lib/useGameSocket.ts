"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectGame, type GameConnection } from "./realtime";
import { applyStateSync, INITIAL_VIEW, type TableView } from "./tableView";

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

  useEffect(() => {
    const conn = connectGame(token, {
      onConnect: () => {
        setView((v) => ({ ...v, connected: true }));
        conn.join(inviteCode);
      },
      onDisconnect: () => setView((v) => ({ ...v, connected: false })),
      // Preserve our own seat: a broadcast sync (another player joining) carries
      // yourSeat=null and must not erase the seat we already hold (PROBLEM 1).
      onState: (state) => setView((v) => applyStateSync(v, state)),
      onDealt: (p) => setView((v) => ({ ...v, hole: p.holeCards })),
      onPhase: (p) =>
        setView((v) =>
          v.state
            ? {
                ...v,
                showdown: null,
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
                state: {
                  ...v.state,
                  currentTurnSeat: p.seat,
                  turnDeadlineTs: p.deadlineTs,
                },
              }
            : v,
        ),
      onBet: (p) =>
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
            state: { ...v.state, players, pot: p.pot, currentBet: p.currentBet },
          };
        }),
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
      onShowdown: (showdown) =>
        setView((v) => ({
          ...v,
          showdown,
          state: v.state ? { ...v.state, phase: "SHOWDOWN", currentTurnSeat: null } : v.state,
        })),
      onResult: (result) =>
        setView((v) => {
          const mine = v.state
            ? result.results.find((r) => r.seat === v.state!.yourSeat)
            : undefined;
          return {
            ...v,
            result,
            showdown: null,
            balance: mine ? mine.finalBalance : v.balance,
            state: v.state ? { ...v.state, phase: "ENDED" } : v.state,
          };
        }),
      // Feature #7: a new hand began in the same room — clear the previous
      // board/result, adopt the rotated dealer, and wait for the private deal.
      onHandStarted: (p) =>
        setView((v) => ({
          ...v,
          result: null,
          showdown: null,
          hole: [],
          waiting: false,
          state: v.state
            ? {
                ...v.state,
                phase: "PREFLOP",
                status: "IN_PROGRESS",
                players: p.players,
                communityCards: [],
                pot: p.pot,
                currentBet: p.currentBet,
                dealerSeat: p.dealerSeat,
                currentTurnSeat: null,
                turnDeadlineTs: null,
              }
            : v.state,
        })),
      // Not enough players can afford the next ante — the room idles, open.
      onSessionWaiting: () =>
        setView((v) => ({
          ...v,
          result: null,
          showdown: null,
          hole: [],
          waiting: true,
          state: v.state
            ? { ...v.state, phase: "LOBBY", status: "LOBBY", currentTurnSeat: null }
            : v.state,
        })),
      onError: (e) => setView((v) => ({ ...v, error: e.messageAr })),
    });
    connRef.current = conn;
    return () => conn.disconnect();
    // Connect once per (token, room).
  }, [token, inviteCode]);

  const start = useCallback(() => connRef.current?.start(), []);
  const nextHand = useCallback(() => connRef.current?.nextHand(), []);
  const placeAction = useCallback(
    (type: string, amount?: number) => connRef.current?.placeAction(type, amount),
    [],
  );
  const selectClaim = useCallback(
    (handRankId: string) => connRef.current?.selectClaim(handRankId),
    [],
  );
  const clearError = useCallback(() => setView((v) => ({ ...v, error: null })), []);

  return { view, start, nextHand, placeAction, selectClaim, clearError };
}
