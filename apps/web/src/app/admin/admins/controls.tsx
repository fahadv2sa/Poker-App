"use client";

import { useActionState } from "react";
import { appointAction, type AdminMgmtState } from "./actions";

const INITIAL: AdminMgmtState = {};
const inputCls =
  "rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50";
const btnCls =
  "rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-50";

export function AppointForm() {
  const [state, action, pending] = useActionState(appointAction, INITIAL);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="playerNumber" inputMode="numeric" placeholder="رقم اللاعب" className={`${inputCls} num`} />
      <select name="role" defaultValue="ADMIN" className={inputCls}>
        <option value="ADMIN">مشرف</option>
        <option value="SUPER_ADMIN">مشرف أعلى</option>
      </select>
      <button disabled={pending} className={btnCls}>
        تعيين
      </button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
      {state.ok ? <span className="text-sm text-primary">{state.message}</span> : null}
    </form>
  );
}
