"use server";

import { redirect } from "next/navigation";
import { prisma, issueOtp, verifyPasswordResetOtp } from "@fp/db";
import { otpConfirmSchema } from "@fp/shared";
import { sendOtpEmail } from "@/lib/email";
import {
  clearPendingReset,
  readPendingReset,
  setResetAuthorized,
} from "@/lib/password-reset";
import { otpRequestRateLimit } from "@/lib/rate-limit";
import type { OtpFormState } from "@/lib/otp-form";

/** Resend a reset code for the pending-reset user (same OTP infra + cooldown). */
export async function requestResetCodeAction(
  _prev: OtpFormState | undefined,
): Promise<OtpFormState> {
  const userId = await readPendingReset();
  if (!userId) redirect("/forgot");

  if (!otpRequestRateLimit(userId)) {
    return { error: "محاولات كثيرة، يُرجى المحاولة لاحقًا" };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) redirect("/forgot");

  const issued = await issueOtp(userId);
  if (issued.status === "cooldown") {
    return {
      cooldownSeconds: issued.retryAfterSeconds,
      error: `يمكنك طلب رمز جديد بعد ${issued.retryAfterSeconds} ثانية`,
    };
  }
  try {
    await sendOtpEmail(user.email, issued.code);
  } catch (err) {
    console.error("OTP email send failed (reset resend)", err);
    return { error: "تعذّر إرسال البريد، حاول مرة أخرى" };
  }
  return { sent: true };
}

/**
 * Confirm the reset code. On success: consume the code (verifyPasswordResetOtp —
 * NO verify flag, NO login), swap the pending-reset cookie for a short-lived
 * reset-authorized cookie, and send the user to set a new password.
 */
export async function confirmResetCodeAction(
  _prev: OtpFormState | undefined,
  formData: FormData,
): Promise<OtpFormState> {
  const userId = await readPendingReset();
  if (!userId) redirect("/forgot");

  const parsed = otpConfirmSchema.safeParse({ code: String(formData.get("code") ?? "") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "رمز غير صحيح" };
  }

  const result = await verifyPasswordResetOtp(userId, parsed.data.code);
  switch (result.status) {
    case "invalid":
      return { error: `رمز غير صحيح. محاولات متبقية: ${result.attemptsRemaining}` };
    case "expired":
      return { error: "انتهت صلاحية الرمز، اطلب رمزًا جديدًا" };
    case "locked":
      return { error: "محاولات كثيرة على هذا الرمز، اطلب رمزًا جديدًا" };
    case "no_code":
      return { error: "لا يوجد رمز نشط، اطلب رمزًا جديدًا" };
    case "verified":
      break;
  }

  await clearPendingReset();
  await setResetAuthorized(userId);
  redirect("/reset-password"); // throws NEXT_REDIRECT — must propagate
}
