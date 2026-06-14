"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/app/login/actions";

type AuthAction = (
  prev: AuthFormState | undefined,
  formData: FormData,
) => Promise<AuthFormState>;

/** Shared login/register card (RTL, premium). */
export function AuthForm({
  action,
  mode,
}: {
  action: AuthAction;
  mode: "login" | "register";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isLogin = mode === "login";

  return (
    <form action={formAction} className="card pad-lg stack" style={{ maxWidth: 420, width: "100%" }}>
      <div className="center stack" style={{ gap: "0.25rem" }}>
        <h1>{isLogin ? "تسجيل الدخول" : "إنشاء حساب"}</h1>
        <p className="muted small">
          {isLogin ? "أهلًا بعودتك إلى طاولة كرة القدم" : "ابدأ برصيد 1000 كوين مجانًا"}
        </p>
      </div>

      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="username">اسم المستخدم</label>
        <input
          id="username"
          name="username"
          className="input"
          autoComplete="username"
          placeholder="مثال: messi_10"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password">كلمة المرور</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete={isLogin ? "current-password" : "new-password"}
          placeholder="٨ أحرف على الأقل"
          required
        />
      </div>

      <button type="submit" className="btn btn-primary lg block" disabled={pending}>
        {pending ? "جارٍ المعالجة…" : isLogin ? "دخول" : "إنشاء الحساب"}
      </button>

      <p className="muted small center">
        {isLogin ? "ليس لديك حساب؟ " : "لديك حساب بالفعل؟ "}
        <Link href={isLogin ? "/register" : "/login"} style={{ color: "var(--primary)" }}>
          {isLogin ? "أنشئ حسابًا" : "سجّل الدخول"}
        </Link>
      </p>
    </form>
  );
}
