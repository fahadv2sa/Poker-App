"use server";

import { redirect } from "next/navigation";
import {
  EmailTakenError,
  UsernameTakenError,
  issueOtp,
  registerUserWithWallet,
} from "@fb/db";
import { registerSchema } from "@fb/shared";
import { hashPassword } from "@/lib/argon";
import { sendOtpEmail } from "@/lib/email";
import { setPendingVerification } from "@/lib/pending-verification";
import { authRateLimit, clientIp } from "@/lib/rate-limit";
import type { AuthFormState } from "@/app/login/actions";

/**
 * Register (Section 13): create account + Wallet/UserStats + 1000 signup bonus
 * (atomic in registerUserWithWallet). The account is created UNVERIFIED — instead
 * of signing in, we issue + email a 6-digit OTP, set the pending-verification
 * cookie, and send the user to /verify. Login stays blocked until they verify.
 */
export async function registerAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  if (!authRateLimit(await clientIp())) {
    return { error: "محاولات كثيرة، يُرجى المحاولة بعد قليل" };
  }
  const parsed = registerSchema.safeParse({
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "مدخلات غير صحيحة" };
  }
  const { username, email, password } = parsed.data;

  let userId: string;
  try {
    const passwordHash = await hashPassword(password);
    const user = await registerUserWithWallet({
      username,
      email,
      passwordHash,
      avatarSeed: username,
    });
    userId = user.id;
  } catch (err) {
    if (err instanceof UsernameTakenError) {
      return { error: "اسم المستخدم محجوز، اختر اسمًا آخر" };
    }
    if (err instanceof EmailTakenError) {
      return { error: "البريد الإلكتروني مستخدم بالفعل" };
    }
    throw err;
  }

  // Issue + send the first code. A send failure is non-fatal: the account exists
  // and the user lands on /verify where they can request a new code.
  const issued = await issueOtp(userId);
  if (issued.status === "issued") {
    try {
      await sendOtpEmail(email, issued.code);
    } catch (err) {
      console.error("OTP email send failed (register)", err);
    }
  }

  await setPendingVerification(userId);
  redirect("/verify");
}
