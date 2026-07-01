"use client";

import Link from "next/link";
import { useActionState } from "react";
import { motion } from "framer-motion";
import { loginAction, type AuthFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmblemIcon, GoldGradientDefs } from "@/components/games/lu-icons";

/** Login card (RTL, gold-on-black): one identifier field (email OR username) + password. */
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
      className="relative z-10 w-full max-w-md"
    >
      <GoldGradientDefs />

      {/* emblem hero */}
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="lu-frame lu-anim-breathe grid size-20 place-items-center rounded-3xl shadow-[0_0_34px_rgb(var(--c-ember)/0.3)]">
          <EmblemIcon size={40} />
        </span>
        <div className="lu-gold-text lu-gold-title text-2xl font-black">فوتبول بي</div>
        <div className="text-xs font-bold tracking-[0.15em] text-[var(--lu-gold-1)]">★ تحديات كرة قدم</div>
      </div>

      <div className="lu-frame rounded-3xl p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-black text-[var(--lu-cream)]">تسجيل الدخول</h1>
            <p className="text-sm text-[var(--lu-tan)]">أهلًا بعودتك إلى الطاولة</p>
          </div>

          {state?.error ? (
            <div className="rounded-md border border-[var(--fb-danger)]/40 bg-[var(--fb-danger)]/10 px-3 py-2 text-sm text-[var(--fb-danger)]">
              {state.error}
            </div>
          ) : notice ? (
            <div className="rounded-md border border-[var(--lu-gold-1)]/40 bg-[var(--lu-gold-2)]/10 px-3 py-2 text-sm text-[var(--lu-gold-1)]">
              {notice}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="identifier" className="text-[var(--lu-cream)]">اسم المستخدم أو البريد الإلكتروني</Label>
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
              <Label htmlFor="password" className="text-[var(--lu-cream)]">كلمة المرور</Label>
              <Link href="/forgot" className="text-xs font-bold text-[var(--lu-gold-1)] hover:underline">
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

          <Button type="submit" size="lg" disabled={pending} className="btn-gold-cta w-full text-black">
            {pending ? "جارٍ المعالجة…" : "دخول"}
          </Button>

          <p className="text-center text-sm text-[var(--lu-tan)]">
            ليس لديك حساب؟{" "}
            <Link href="/register" className="font-bold text-[var(--lu-gold-1)] hover:underline">
              أنشئ حسابًا
            </Link>
          </p>
        </form>
      </div>
    </motion.div>
  );
}
