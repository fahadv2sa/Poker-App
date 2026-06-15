"use server";

import { AuthError } from "next-auth";
import { registerUserWithWallet, UsernameTakenError } from "@fp/db";
import { registerSchema } from "@fp/shared";
import { signIn } from "@/auth";
import { hashPassword } from "@/lib/argon";
import { authRateLimit, clientIp } from "@/lib/rate-limit";
import type { AuthFormState } from "@/app/login/actions";

/**
 * Register (Section 13): create account + Wallet/UserStats + 1000 signup bonus
 * (atomic in registerUserWithWallet), then sign the new user straight in.
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
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "مدخلات غير صحيحة" };
  }
  const { username, password } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);
    await registerUserWithWallet({ username, passwordHash, avatarSeed: username });
  } catch (err) {
    if (err instanceof UsernameTakenError) {
      return { error: "اسم المستخدم محجوز، اختر اسمًا آخر" };
    }
    throw err;
  }

  try {
    await signIn("credentials", { username, password, redirectTo: "/" });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "تم إنشاء الحساب، لكن تعذّر تسجيل الدخول تلقائيًا" };
    }
    throw err;
  }
}
