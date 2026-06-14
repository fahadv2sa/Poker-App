"use client";

import Link from "next/link";
import { useActionState } from "react";
import { motion } from "framer-motion";
import type { AuthFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <Card className="p-6 sm:p-8">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl">{isLogin ? "تسجيل الدخول" : "إنشاء حساب"}</h1>
            <p className="text-sm text-muted-foreground">
              {isLogin ? "أهلًا بعودتك إلى طاولة كرة القدم" : "ابدأ برصيد 1000 كوين مجانًا"}
            </p>
          </div>

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

          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? "جارٍ المعالجة…" : isLogin ? "دخول" : "إنشاء الحساب"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "ليس لديك حساب؟ " : "لديك حساب بالفعل؟ "}
            <Link href={isLogin ? "/register" : "/login"} className="text-primary hover:underline">
              {isLogin ? "أنشئ حسابًا" : "سجّل الدخول"}
            </Link>
          </p>
        </form>
      </Card>
    </motion.div>
  );
}
