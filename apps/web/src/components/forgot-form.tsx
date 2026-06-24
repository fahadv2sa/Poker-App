"use client";

import Link from "next/link";
import { useActionState } from "react";
import { motion } from "framer-motion";
import { forgotPasswordAction } from "@/app/forgot/actions";
import type { AuthFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { Panel } from "@/components/panel";

/** Forgot-password step 1 (RTL): enter email-or-username to receive a reset code. */
export function ForgotForm() {
  const [state, formAction, pending] = useActionState<AuthFormState | undefined, FormData>(
    forgotPasswordAction,
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
        <div className="text-xs font-bold tracking-[0.15em] text-gold">★ استعادة كلمة المرور</div>
      </div>

      <Panel accent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl">نسيت كلمة المرور؟</h1>
            <p className="text-sm text-muted-foreground">
              أدخل اسم المستخدم أو البريد الإلكتروني وسنرسل لك رمزًا لإعادة التعيين
            </p>
          </div>

          {state?.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
              {state.error}
            </div>
          ) : null}
          {state?.notice ? (
            <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              {state.notice}
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

          <Button type="submit" size="lg" disabled={pending} className="btn-cta w-full">
            {pending ? "جارٍ الإرسال…" : "إرسال الرمز"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            تذكّرت كلمة المرور؟{" "}
            <Link href="/login" className="font-bold text-primary hover:underline">
              العودة لتسجيل الدخول
            </Link>
          </p>
        </form>
      </Panel>
    </motion.div>
  );
}
