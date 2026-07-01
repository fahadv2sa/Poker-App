"use client";

import { useActionState, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { OtpFormState } from "@/lib/otp-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmblemIcon, GoldGradientDefs } from "@/components/games/lu-icons";

type ConfirmAction = (prev: OtpFormState | undefined, formData: FormData) => Promise<OtpFormState>;
type ResendAction = (prev: OtpFormState | undefined) => Promise<OtpFormState>;

/**
 * Reusable email-OTP code-entry card (RTL, gold): clean 6-digit entry + resend
 * with live cooldown. Used by both signup verification and password reset — the
 * caller supplies the server actions and copy, so behaviour-after-success differs
 * while the UI stays consistent.
 */
export function VerifyForm({
  maskedEmail,
  confirmAction,
  resendAction,
  badge = "تأكيد البريد الإلكتروني",
  title = "أدخل رمز التحقق",
  submitLabel = "تأكيد وتسجيل الدخول",
}: {
  maskedEmail: string;
  confirmAction: ConfirmAction;
  resendAction: ResendAction;
  badge?: string;
  title?: string;
  submitLabel?: string;
}) {
  const [confirmState, confirm, confirming] = useActionState(confirmAction, undefined);
  const [resendState, resend, resending] = useActionState<OtpFormState | undefined, FormData>(
    () => resendAction(undefined),
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
      className="relative z-10 w-full max-w-md"
    >
      <GoldGradientDefs />
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="lu-frame lu-anim-breathe grid size-20 place-items-center rounded-3xl shadow-[0_0_34px_rgb(var(--c-ember)/0.3)]">
          <EmblemIcon size={40} />
        </span>
        <div className="lu-gold-text lu-gold-title text-2xl font-black">فوتبول بي</div>
        <div className="text-xs font-bold tracking-[0.15em] text-[var(--lu-gold-1)]">★ {badge}</div>
      </div>

      <div className="lu-frame rounded-3xl p-6">
        <form action={confirm} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-black text-[var(--lu-cream)]">{title}</h1>
            <p className="text-sm text-[var(--lu-tan)]">
              أرسلنا رمزًا من ٦ أرقام إلى <span className="num" dir="ltr">{maskedEmail}</span>
            </p>
          </div>

          {confirmState?.error ? (
            <div className="rounded-md border border-[var(--fb-danger)]/40 bg-[var(--fb-danger)]/10 px-3 py-2 text-sm text-[var(--fb-danger)]">
              {confirmState.error}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="code" className="text-[var(--lu-cream)]">الرمز</Label>
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

          <Button type="submit" size="lg" disabled={confirming} className="btn-gold-cta w-full text-black">
            {confirming ? "جارٍ التحقق…" : submitLabel}
          </Button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-center">
          {resendState?.sent ? (
            <p className="text-sm text-[var(--lu-gold-1)]">تم إرسال رمز جديد إلى بريدك</p>
          ) : null}
          {resendState?.error && !resendState.cooldownSeconds ? (
            <p className="text-sm text-[var(--fb-danger)]">{resendState.error}</p>
          ) : null}
          <form action={resend}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={resending || cooldown > 0}
              className="text-[var(--lu-gold-1)]"
            >
              {cooldown > 0
                ? `إعادة الإرسال بعد ${cooldown} ثانية`
                : resending
                  ? "جارٍ الإرسال…"
                  : "لم يصلك الرمز؟ أعد الإرسال"}
            </Button>
          </form>
        </div>
      </div>
    </motion.div>
  );
}
