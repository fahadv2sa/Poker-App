"use client";
import { useActionState } from "react";
import { GoldButton, GoldTitle, Panel } from "@fb/top-10-ui";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(loginAction, null);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <div className="lu-orb mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full text-3xl font-black text-[#2a1f02]">
          10
        </div>
        <GoldTitle className="text-4xl">توب 10</GoldTitle>
        <p className="mt-1 text-[var(--lu-tan)]">سجّل الدخول بحسابك في منصة فوتبول بي</p>
      </div>
      <Panel className="w-full">
        <form action={action} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-[var(--lu-cream)]">
            اسم المستخدم أو البريد الإلكتروني
            <input
              name="identifier"
              required
              className="rounded-xl border border-[var(--border)] bg-black/40 px-3 py-2 text-[var(--lu-cream)] outline-none focus:border-[var(--gold)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--lu-cream)]">
            كلمة المرور
            <input
              name="password"
              type="password"
              required
              className="rounded-xl border border-[var(--border)] bg-black/40 px-3 py-2 text-[var(--lu-cream)] outline-none focus:border-[var(--gold)]"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <GoldButton type="submit" disabled={pending}>
            {pending ? "جارٍ الدخول…" : "دخول"}
          </GoldButton>
        </form>
      </Panel>
    </main>
  );
}
