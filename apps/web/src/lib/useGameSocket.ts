"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CardView,
  GameResultPayload,
  ShowdownStartPayload,
  StateSyncPayload,
} from "@fp/shared";
import { connectGame, type GameConnection } from "./realtime";

/**
 * Live table state. The server emits granular events (Section 12); this hook
 * folds them into one view model the table renders. The server remains the only
 * referee — this is presentation state, re-synced from `state:sync` on connect.
 */
export interface TableView {
  connected: boolean;
  state: StateSyncPayload | null;
  hole: CardView[];
  showdown: ShowdownStartPayload | null;
  result: GameResultPayload | null;
  error: string | null;
}

const INITIAL: TableView = {
  connected: false,
  state: null,
  hole: [],
  showdown: null,
  result: null,
  error: null,
};

export function useGameSocket(token: string, inviteCode: string) {
  const [view, setView] = useState<TableView>(INITIAL);
  const connRef = useRef<GameConnection | null>(null);

  useEffect(() => {
    const conn = connectGame(token, {
      onConnect: () => {
        setView((v) => ({ ...v, connected: true }));
        conn.join(inviteCode);
      },
      onDisconnect: () => setView((v) => ({ ...v, connected: false })),
      onState: (state) => setView((v) => ({ ...v, state })),
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
        setView((v) => ({
          ...v,
          result,
          showdown: null,
          state: v.state ? { ...v.state, phase: "ENDED" } : v.state,
        })),
      onError: (e) => setView((v) => ({ ...v, error: e.messageAr })),
    });
    connRef.current = conn;
    return () => conn.disconnect();
    // Connect once per (token, room).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, inviteCode]);

  const start = useCallback(() => connRef.current?.start(), []);
  const placeAction = useCallback(
    (type: string, amount?: number) => connRef.current?.placeAction(type, amount),
    [],
  );
  const selectClaim = useCallback(
    (handRankId: string) => connRef.current?.selectClaim(handRankId),
    [],
  );
  const clearError = useCallback(() => setView((v) => ({ ...v, error: null })), []);

  return { view, start, placeAction, selectClaim, clearError };
}
