"use server";

import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { resetPasswordSchema } from "@fp/shared";
import { hashPassword } from "@/lib/argon";
import { clearResetAuthorized, readResetAuthorized } from "@/lib/password-reset";
import { authRateLimit, clientIp } from "@/lib/rate-limit";
import type { AuthFormState } from "@/app/login/actions";

/**
 * Forgot-password final step: set the new password. Authorized ONLY by the
 * reset-authorized cookie (minted after the reset OTP was verified). Does NOT log
 * the user in — clears the cookie and sends them to /login to sign in fresh.
 */
export async function resetPasswordAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  if (!authRateLimit(await clientIp())) {
    return { error: "محاولات كثيرة، يُرجى المحاولة بعد قليل" };
  }

  const userId = await readResetAuthorized();
  if (!userId) redirect("/forgot"); // not authorized / expired → start over

  const parsed = resetPasswordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "مدخلات غير صحيحة" };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await clearResetAuthorized();

  redirect("/login?reset=1"); // throws NEXT_REDIRECT — must propagate
}
