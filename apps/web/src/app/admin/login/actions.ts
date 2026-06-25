"use server";

import { redirect } from "next/navigation";
import { loadAdminContext, recordAdminAction } from "@fb/admin-core";
import { authRateLimit, clientIp } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/argon";
import { findUserByIdentifier } from "@/lib/resolve-identifier";
import { clearAdminSessionCookie, setAdminSessionCookie } from "@/lib/admin-session";

export interface AdminLoginState {
  error?: string;
}

// One generic failure for every rejection (no account / wrong password / not an
// admin / suspended / disabled) — never leaks which condition failed.
const GENERIC: AdminLoginState = { error: "بيانات الدخول غير صحيحة أو لا تملك صلاحية الدخول." };

/**
 * Admin login — independent of the game login. Authenticates with the account's
 * own password, but ONLY accounts holding an ACTIVE admin row may enter (the
 * super-admin now; any future appointed admin once granted). Sets the separate
 * `fb_admin` cookie and lands on /admin.
 */
export async function adminLoginAction(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const ip = await clientIp();
  if (!authRateLimit(ip)) {
    return { error: "محاولات كثيرة، يُرجى المحاولة بعد قليل." };
  }

  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await findUserByIdentifier(identifier);
  if (!user) return GENERIC;
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) return GENERIC;
  if (user.disabledAt) return GENERIC;

  // The real gate: the account must be an ACTIVE admin (loadAdminContext returns
  // null otherwise — non-admin, or suspended).
  const ctx = await loadAdminContext(user.id);
  if (!ctx) return GENERIC;

  await setAdminSessionCookie(user.id);
  try {
    await recordAdminAction({ actorUserId: user.id, action: "admin.login", ip });
  } catch {
    // Audit is best-effort — never block a valid login on an audit write.
  }
  redirect("/admin");
}

export async function adminLogoutAction(): Promise<void> {
  await clearAdminSessionCookie();
  redirect("/admin/login");
}
