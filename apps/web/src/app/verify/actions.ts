"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, issueOtp, verifyOtp } from "@fp/db";
import { otpConfirmSchema } from "@fp/shared";
import { signIn } from "@/auth";
import { sendOtpEmail } from "@/lib/email";
import {
  clearPendingVerification,
  readPendingVerification,
} from "@/lib/pending-verification";
import { mintOtpLoginToken } from "@/lib/otp-login-token";
import { otpRequestRateLimit } from "@/lib/rate-limit";

export interface VerifyFormState {
  error?: string;
  sent?: boolean;
  /** When a resend is on cooldown, seconds until the next allowed request. */
  cooldownSeconds?: number;
}

/**
 * Resend: issue + email a fresh code for the pending user. Identity comes ONLY
 * from the pending-verification cookie. Honors the per-account ceiling and the
 * per-code cooldown (issueOtp), which replaces the active code once elapsed.
 */
export async function requestCodeAction(
  _prev: VerifyFormState | undefined,
): Promise<VerifyFormState> {
  const userId = await readPendingVerification();
  if (!userId) redirect("/login");

  if (!otpRequestRateLimit(userId)) {
    return { error: "محاولات كثيرة، يُرجى المحاولة لاحقًا" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!user?.email) redirect("/login");
  if (user.emailVerifiedAt) {
    await clearPendingVerification();
    redirect("/login");
  }

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
    console.error("OTP email send failed (resend)", err);
    return { error: "تعذّر إرسال البريد، حاول مرة أخرى" };
  }
  return { sent: true };
}

/**
 * Confirm: verify the submitted code for the pending user. On success, mark
 * verified (done inside verifyOtp), clear the cookie, and log the user in via the
 * password-less `otp-verified` provider, then redirect home.
 */
export async function confirmCodeAction(
  _prev: VerifyFormState | undefined,
  formData: FormData,
): Promise<VerifyFormState> {
  const userId = await readPendingVerification();
  if (!userId) redirect("/login");

  const parsed = otpConfirmSchema.safeParse({ code: String(formData.get("code") ?? "") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "رمز غير صحيح" };
  }

  const result = await verifyOtp(userId, parsed.data.code);
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

  // Verified — establish the session without a password, then go home.
  await clearPendingVerification();
  const token = await mintOtpLoginToken(userId);
  try {
    await signIn("otp-verified", { token, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "تم التأكيد، لكن تعذّر تسجيل الدخول تلقائيًا. سجّل الدخول." };
    }
    throw err; // NEXT_REDIRECT on success
  }
  return {};
}
