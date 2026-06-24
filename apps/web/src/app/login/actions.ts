"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { authRateLimit, clientIp } from "@/lib/rate-limit";
import { setPendingVerification } from "@/lib/pending-verification";
import { findUserByIdentifier } from "@/lib/resolve-identifier";

export interface AuthFormState {
  error?: string;
  /** Neutral, non-error message (e.g. the forgot-password confirmation). */
  notice?: string;
}

/** Credentials sign-in (Section 19.8). On success NextAuth redirects to "/". */
export async function loginAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  if (!authRateLimit(await clientIp())) {
    return { error: "محاولات كثيرة، يُرجى المحاولة بعد قليل" };
  }
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { identifier, password, redirectTo: "/" });
    return {};
  } catch (err) {
    // Correct password but unverified email → start the verification flow rather
    // than show an error. (authorize threw UnverifiedEmailError → code "unverified".)
    if (err instanceof CredentialsSignin && err.code === "unverified") {
      const user = await findUserByIdentifier(identifier);
      if (user) await setPendingVerification(user.id);
      redirect("/verify"); // throws NEXT_REDIRECT — must propagate
    }
    if (err instanceof AuthError) {
      return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
    }
    throw err; // re-throw redirect/control-flow signals
  }
}
