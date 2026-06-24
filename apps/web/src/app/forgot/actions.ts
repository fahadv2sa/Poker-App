"use server";

import { redirect } from "next/navigation";
import { issueOtp } from "@fp/db";
import { forgotPasswordSchema } from "@fp/shared";
import { sendOtpEmail } from "@/lib/email";
import { setPendingReset } from "@/lib/password-reset";
import { findUserByIdentifier } from "@/lib/resolve-identifier";
import { authRateLimit, clientIp } from "@/lib/rate-limit";
import type { AuthFormState } from "@/app/login/actions";

/**
 * Forgot-password step 1: resolve the email-or-username, and if an account
 * exists, issue + email a reset OTP (reusing the SAME OTP infra: 5-min expiry,
 * 60s cooldown-replaces, one-active-code, hashed, opportunistic purge), set the
 * pending-reset cookie, and send the user to the reset code-entry page. If no
 * account matches, return a neutral message (don't confirm existence).
 */
export async function forgotPasswordAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  if (!authRateLimit(await clientIp())) {
    return { error: "محاولات كثيرة، يُرجى المحاولة بعد قليل" };
  }
  const parsed = forgotPasswordSchema.safeParse({
    identifier: String(formData.get("identifier") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "مدخلات غير صحيحة" };
  }

  const user = await findUserByIdentifier(parsed.data.identifier);
  if (user?.email) {
    const issued = await issueOtp(user.id);
    if (issued.status === "issued") {
      try {
        await sendOtpEmail(user.email, issued.code);
      } catch (err) {
        console.error("OTP email send failed (forgot)", err);
      }
    }
    // (If status is "cooldown" a valid recent code already exists — proceed to the
    // code page either way; the user can enter the code they already received.)
    await setPendingReset(user.id);
    redirect("/reset-verify"); // throws NEXT_REDIRECT — must propagate
  }

  return {
    notice: "إن كان لديك حساب مرتبط بهذا المُعرّف، فسيصلك رمز على بريدك الإلكتروني.",
  };
}
