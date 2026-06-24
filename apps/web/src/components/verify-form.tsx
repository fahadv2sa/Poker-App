"use client";

import { useActionState, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { confirmCodeAction, requestCodeAction, type VerifyFormState } from "@/app/verify/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { Panel } from "@/components/panel";

/** Email-OTP verification card (RTL, premium). Code entry + resend with cooldown. */
export function VerifyForm({ maskedEmail }: { maskedEmail: string }) {
  const [confirmState, confirmAction, confirming] = useActionState(confirmCodeAction, undefined);
  const [resendState, resendAction, resending] = useActionState<VerifyFormState | undefined, FormData>(
    () => requestCodeAction(undefined),
    undefined,
  );

  // Cooldown countdown driven by the server's `cooldownSeconds` response.
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (resendState?.cooldownSeconds) setCooldown(resendState.cooldownSeconds);
  }, [resendState]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

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
        <div className="text-xs font-bold tracking-[0.15em] text-gold">★ تأكيد البريد الإلكتروني</div>
      </div>

      <Panel accent>
        <form action={confirmAction} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl">أدخل رمز التحقق</h1>
            <p className="text-sm text-muted-foreground">
              أرسلنا رمزًا من ٦ أرقام إلى <span className="num" dir="ltr">{maskedEmail}</span>
            </p>
          </div>

          {confirmState?.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
              {confirmState.error}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="code">الرمز</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              placeholder="••••••"
              dir="ltr"
              className="num text-center text-2xl tracking-[0.5em]"
              required
            />
          </div>

          <Button type="submit" size="lg" disabled={confirming} className="btn-cta w-full">
            {confirming ? "جارٍ التحقق…" : "تأكيد وتسجيل الدخول"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-center">
          {resendState?.sent ? (
            <p className="text-sm text-emerald-400">تم إرسال رمز جديد إلى بريدك</p>
          ) : null}
          {resendState?.error && !resendState.cooldownSeconds ? (
            <p className="text-sm text-destructive-foreground">{resendState.error}</p>
          ) : null}
          <form action={resendAction}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={resending || cooldown > 0}
              className="text-primary"
            >
              {cooldown > 0
                ? `إعادة الإرسال بعد ${cooldown} ثانية`
                : resending
                  ? "جارٍ الإرسال…"
                  : "لم يصلك الرمز؟ أعد الإرسال"}
            </Button>
          </form>
        </div>
      </Panel>
    </motion.div>
  );
}
