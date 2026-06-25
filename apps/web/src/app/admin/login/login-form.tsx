"use client";

import { useActionState } from "react";
import { adminLoginAction, type AdminLoginState } from "./actions";

const INITIAL: AdminLoginState = {};
const inputCls =
  "w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50";

export function LoginForm() {
  const [state, action, pending] = useActionState(adminLoginAction, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <input name="identifier" autoComplete="username" placeholder="اسم المستخدم أو البريد" className={inputCls} />
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="كلمة المرور"
        className={inputCls}
      />
      <button
        disabled={pending}
        className="w-full rounded-lg border border-white/10 bg-primary/15 px-4 py-2.5 text-sm font-black hover:bg-primary/25 disabled:opacity-50"
      >
        دخول
      </button>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
