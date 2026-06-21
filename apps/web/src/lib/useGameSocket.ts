"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StateSyncPayload } from "@fp/shared";
import { connectGame, type GameConnection } from "./realtime";
import { actionNotice, applyStateSync, INITIAL_VIEW, type TableView } from "./tableView";

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

  // Latest state (for name lookups inside event handlers) + a stable notice
  // pusher, both kept in refs so the connect effect runs once per (token, room).
  const stateRef = useRef<StateSyncPayload | null>(null);
  stateRef.current = view.state;
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
  const nameOf = (seat: number) =>
    stateRef.current?.players.find((p) => p.seat === seat)?.username ?? `مقعد ${seat}`;

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
            ? { ...v, state: { ...v.state, currentTurnSeat: p.seat, turnDeadlineTs: p.deadlineTs } }
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
        // C10: announce the action to the whole table (works for every seat).
        pushNoticeRef.current(actionNotice(nameOf(p.seat), p), "action");
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
      // A3: track who has claimed at showdown.
      onClaimReceived: (p) =>
        setView((v) =>
          v.claimedSeats.includes(p.seat)
            ? v
            : { ...v, claimedSeats: [...v.claimedSeats, p.seat] },
        ),
      onShowdown: (showdown) =>
        setView((v) => ({
          ...v,
          showdown,
          bestRank: null,
          claimedSeats: [],
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
            // A7: keep the header balance authoritative — adopt the server's
            // finalBalance for our seat as the new base going into the next hand.
            balance: mine ? mine.finalBalance : v.balance,
            state: v.state ? { ...v.state, phase: "ENDED" } : v.state,
          };
        }),
      // Private per-seat winner-screen reveal: the local player's own best rank.
      onBestRank: (p) => setView((v) => ({ ...v, bestRank: p })),
      // Feature #7: a new hand began in the same room — clear the previous
      // board/result, adopt the rotated dealer, and wait for the private deal.
      onHandStarted: (p) =>
        setView((v) => ({
          ...v,
          result: null,
          bestRank: null,
          showdown: null,
          hole: [],
          waiting: false,
          claimedSeats: [],
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
      // Not enough players can afford the next ante — the room idles, open.
      onSessionWaiting: () =>
        setView((v) => ({
          ...v,
          result: null,
          bestRank: null,
          showdown: null,
          hole: [],
          waiting: true,
          state: v.state
            ? { ...v.state, phase: "LOBBY", status: "LOBBY", currentTurnSeat: null }
            : v.state,
        })),
      // A6: an opponent disconnected/left — transient banner.
      onPlayerLeft: (p) =>
        pushNoticeRef.current(`${p.username || `مقعد ${p.seat}`} غادر الطاولة`, "system"),
      // The room was closed (host or auto-empty): mark it so the table redirects.
      onRoomClosed: (p) => setView((v) => ({ ...v, closed: p.reason })),
      onError: (e) => setView((v) => ({ ...v, error: e.messageAr })),
    });
    connRef.current = conn;
    return () => conn.disconnect();
    // Connect once per (token, room).
  }, [token, inviteCode]);

  const start = useCallback(() => connRef.current?.start(), []);
  const nextHand = useCallback(() => connRef.current?.nextHand(), []);
  const closeTable = useCallback(() => connRef.current?.closeTable(), []);
  const leave = useCallback(() => connRef.current?.leave(), []);
  const placeAction = useCallback(
    (type: string, amount?: number) => connRef.current?.placeAction(type, amount),
    [],
  );
  const selectClaim = useCallback(
    (handRankId: string) => connRef.current?.selectClaim(handRankId),
    [],
  );
  const clearError = useCallback(() => setView((v) => ({ ...v, error: null })), []);

  return { view, start, nextHand, closeTable, leave, placeAction, selectClaim, clearError };
}
