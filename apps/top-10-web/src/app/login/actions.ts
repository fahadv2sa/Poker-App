"use server";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { identifier, password, redirectTo: "/" });
    return null;
  } catch (e) {
    if (e instanceof AuthError) return "بيانات الدخول غير صحيحة";
    throw e; // NEXT_REDIRECT on success — must propagate
  }
}
