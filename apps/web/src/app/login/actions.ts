"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export interface AuthFormState {
  error?: string;
}

/** Credentials sign-in (Section 19.8). On success NextAuth redirects to "/". */
export async function loginAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { username, password, redirectTo: "/" });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
    }
    throw err; // re-throw redirect/control-flow signals
  }
}
