"use client";

import Link from "next/link";
import { useActionState } from "react";
import { motion } from "framer-motion";
import type { AuthFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { Panel } from "@/components/panel";

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
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-md"
    >
      {/* Brand hero — first impression reads as a game, not a SaaS login. */}
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Logo glow className="size-20" />
        <div className="text-2xl font-black">فوتبول بي</div>
        <div className="text-xs font-bold tracking-[0.15em] text-gold">★ تحديات كرة قدم · بوكر</div>
      </div>

      <Panel accent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl">{isLogin ? "تسجيل الدخول" : "إنشاء حساب"}</h1>
            <p className="text-sm text-muted-foreground">
              {isLogin ? "أهلًا بعودتك إلى الطاولة" : "أنشئ حسابك وابدأ اللعب"}
            </p>
          </div>

          {!isLogin ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-center text-sm font-bold text-gold">
              🎁 ابدأ برصيد <span className="num">1000</span> كوين مجانًا
            </div>
          ) : null}

          {state?.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
              {state.error}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              placeholder="مثال: messi_10"
              required
            />
          </div>

          {!isLogin ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="example@mail.com"
                dir="ltr"
                required
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="٨ أحرف على الأقل"
              required
            />
          </div>

          <Button type="submit" size="lg" disabled={pending} className="btn-cta w-full">
            {pending ? "جارٍ المعالجة…" : isLogin ? "دخول" : "إنشاء الحساب"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "ليس لديك حساب؟ " : "لديك حساب بالفعل؟ "}
            <Link href={isLogin ? "/register" : "/login"} className="font-bold text-primary hover:underline">
              {isLogin ? "أنشئ حسابًا" : "سجّل الدخول"}
            </Link>
          </p>
        </form>
      </Panel>
    </motion.div>
  );
}
