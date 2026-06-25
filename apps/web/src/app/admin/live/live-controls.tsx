"use client";

import { useActionState } from "react";
import {
  forceCloseAction,
  kickSeatAction,
  toggleBotsAction,
  type LiveActionState,
} from "./actions";

const INITIAL: LiveActionState = {};
const btn =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold hover:bg-white/10 disabled:opacity-50";

function Msg({ state }: { state: LiveActionState }) {
  if (state.error) return <span className="mr-2 text-xs text-destructive">{state.error}</span>;
  if (state.ok && state.message) return <span className="mr-2 text-xs text-primary">{state.message}</span>;
  return null;
}

export function CloseTableButton({ gameId }: { gameId: string }) {
  const [state, action, pending] = useActionState(forceCloseAction.bind(null, gameId), INITIAL);
  return (
    <form action={action} className="inline-flex items-center">
      <button disabled={pending} className={`${btn} border-destructive/40 text-destructive`}>
        إغلاق الطاولة
      </button>
      <Msg state={state} />
    </form>
  );
}

export function KickButton({ gameId, seat }: { gameId: string; seat: number }) {
  const [state, action, pending] = useActionState(
    kickSeatAction.bind(null, gameId, seat),
    INITIAL,
  );
  return (
    <form action={action} className="inline-flex items-center">
      <button disabled={pending} className={btn}>
        إخراج
      </button>
      <Msg state={state} />
    </form>
  );
}

export function BotsToggle({ paused }: { paused: boolean }) {
  const [state, action, pending] = useActionState(
    toggleBotsAction.bind(null, !paused),
    INITIAL,
  );
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <button disabled={pending} className={btn}>
        {paused ? "استئناف البوتات" : "إيقاف البوتات"}
      </button>
      <Msg state={state} />
    </form>
  );
}
