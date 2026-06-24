"use client";

import { useActionState, useState } from "react";
import { motion } from "framer-motion";
import { resetPasswordAction } from "@/app/reset-password/actions";
import type { AuthFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Panel } from "@/components/panel";
import { PasswordConfirmFields } from "@/components/password-confirm-fields";

/** Forgot-password final step (RTL): set a new password (twice, live match). */
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthFormState | undefined, FormData>(
    resetPasswordAction,
    undefined,
  );
  const [pwValid, setPwValid] = useState(false);

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
        <div className="text-xs font-bold tracking-[0.15em] text-gold">★ كلمة مرور جديدة</div>
      </div>

      <Panel accent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl">تعيين كلمة مرور جديدة</h1>
            <p className="text-sm text-muted-foreground">أدخل كلمة المرور الجديدة مرتين</p>
          </div>

          {state?.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
              {state.error}
            </div>
          ) : null}

          <PasswordConfirmFields passwordLabel="كلمة المرور الجديدة" onValidityChange={setPwValid} />

          <Button type="submit" size="lg" disabled={pending || !pwValid} className="btn-cta w-full">
            {pending ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
          </Button>
        </form>
      </Panel>
    </motion.div>
  );
}
