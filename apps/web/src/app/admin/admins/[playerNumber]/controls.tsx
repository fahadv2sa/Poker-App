"use client";

import { useActionState } from "react";
import { ALL_PERMISSION_KEYS, type AdminRole } from "@fb/shared";
import {
  removeAction,
  setRoleAction,
  setStatusAction,
  togglePermAction,
  type AdminMgmtState,
} from "./actions";

const INITIAL: AdminMgmtState = {};
const btn =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-bold hover:bg-white/10 disabled:opacity-50";

function Msg({ state }: { state: AdminMgmtState }) {
  if (state.error) return <span className="mr-2 text-xs text-destructive">{state.error}</span>;
  if (state.ok && state.message) return <span className="mr-2 text-xs text-primary">{state.message}</span>;
  return null;
}

export function RoleControl({ playerNumber, role }: { playerNumber: number; role: AdminRole }) {
  const next: AdminRole = role === "SUPER_ADMIN" ? "ADMIN" : "SUPER_ADMIN";
  const [state, action, pending] = useActionState(setRoleAction.bind(null, playerNumber, next), INITIAL);
  return (
    <form action={action} className="inline-flex items-center">
      <button disabled={pending} className={btn}>
        {role === "SUPER_ADMIN" ? "تخفيض إلى مشرف" : "ترقية إلى مشرف أعلى"}
      </button>
      <Msg state={state} />
    </form>
  );
}

export function StatusControl({
  playerNumber,
  status,
}: {
  playerNumber: number;
  status: "ACTIVE" | "SUSPENDED";
}) {
  const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  const [state, action, pending] = useActionState(setStatusAction.bind(null, playerNumber, next), INITIAL);
  return (
    <form action={action} className="inline-flex items-center">
      <button disabled={pending} className={btn}>
        {status === "ACTIVE" ? "إيقاف" : "تفعيل"}
      </button>
      <Msg state={state} />
    </form>
  );
}

export function RemoveControl({ playerNumber }: { playerNumber: number }) {
  const [state, action, pending] = useActionState(removeAction.bind(null, playerNumber), INITIAL);
  return (
    <form action={action} className="inline-flex items-center">
      <button disabled={pending} className={`${btn} border-destructive/40 text-destructive`}>
        إزالة المشرف
      </button>
      <Msg state={state} />
    </form>
  );
}

export function PermissionGrid({
  playerNumber,
  granted,
}: {
  playerNumber: number;
  granted: string[];
}) {
  const set = new Set(granted);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ALL_PERMISSION_KEYS.map((key) => (
        <PermToggle key={key} playerNumber={playerNumber} permKey={key} granted={set.has(key)} />
      ))}
    </div>
  );
}

function PermToggle({
  playerNumber,
  permKey,
  granted,
}: {
  playerNumber: number;
  permKey: string;
  granted: boolean;
}) {
  const [state, action, pending] = useActionState(
    togglePermAction.bind(null, playerNumber, permKey, !granted),
    INITIAL,
  );
  return (
    <form
      action={action}
      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-card/50 px-3 py-1.5"
    >
      <span className="num text-xs">{permKey}</span>
      <span className="flex items-center gap-2">
        {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
        <button
          disabled={pending}
          className={`text-xs font-bold ${granted ? "text-primary" : "text-muted-foreground"}`}
        >
          {granted ? "✓ ممنوحة" : "منح"}
        </button>
      </span>
    </form>
  );
}
