"use client";

import Link from "next/link";
import { useActionState } from "react";
import { motion } from "framer-motion";
import { loginAction, type AuthFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { Panel } from "@/components/panel";

/** Login card (RTL, premium): one identifier field (email OR username) + password. */
export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState | undefined, FormData>(
    loginAction,
    undefined,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-md"
    >
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Logo glow className="size-20" />
        <div className="text-2xl font-black">فوتبول بي</div>
        <div className="text-xs font-bold tracking-[0.15em] text-gold">★ تحديات كرة قدم · بوكر</div>
      </div>

      <Panel accent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl">تسجيل الدخول</h1>
            <p className="text-sm text-muted-foreground">أهلًا بعودتك إلى الطاولة</p>
          </div>

          {state?.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
              {state.error}
            </div>
          ) : notice ? (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              {notice}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="identifier">اسم المستخدم أو البريد الإلكتروني</Label>
            <Input
              id="identifier"
              name="identifier"
              autoComplete="username"
              placeholder="اسم المستخدم أو البريد الإلكتروني"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">كلمة المرور</Label>
              <Link href="/forgot" className="text-xs font-bold text-primary hover:underline">
                نسيت كلمة المرور؟
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" size="lg" disabled={pending} className="btn-cta w-full">
            {pending ? "جارٍ المعالجة…" : "دخول"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            ليس لديك حساب؟{" "}
            <Link href="/register" className="font-bold text-primary hover:underline">
              أنشئ حسابًا
            </Link>
          </p>
        </form>
      </Panel>
    </motion.div>
  );
}
