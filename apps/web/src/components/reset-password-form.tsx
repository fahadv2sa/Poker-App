"use client";

import { useActionState, useState } from "react";
import { motion } from "framer-motion";
import { resetPasswordAction } from "@/app/reset-password/actions";
import type { AuthFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { EmblemIcon, GoldGradientDefs } from "@/components/games/lu-icons";
import { PasswordConfirmFields } from "@/components/password-confirm-fields";

/** Forgot-password final step (RTL, gold): set a new password (twice, live match). */
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
      className="relative z-10 w-full max-w-md"
    >
      <GoldGradientDefs />
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="lu-frame lu-anim-breathe grid size-20 place-items-center rounded-3xl shadow-[0_0_34px_rgba(255,106,26,0.3)]">
          <EmblemIcon size={40} />
        </span>
        <div className="lu-gold-text lu-gold-title text-2xl font-black">فوتبول بي</div>
        <div className="text-xs font-bold tracking-[0.15em] text-[var(--lu-gold-1)]">★ كلمة مرور جديدة</div>
      </div>

      <div className="lu-frame rounded-3xl p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-black text-[var(--lu-cream)]">تعيين كلمة مرور جديدة</h1>
            <p className="text-sm text-[var(--lu-tan)]">أدخل كلمة المرور الجديدة مرتين</p>
          </div>

          {state?.error ? (
            <div className="rounded-md border border-[#d9694f]/40 bg-[#d9694f]/10 px-3 py-2 text-sm text-[#d9694f]">
              {state.error}
            </div>
          ) : null}

          <PasswordConfirmFields passwordLabel="كلمة المرور الجديدة" onValidityChange={setPwValid} />

          <Button type="submit" size="lg" disabled={pending || !pwValid} className="btn-gold-cta w-full text-black">
            {pending ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
