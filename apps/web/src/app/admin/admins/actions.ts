"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { findUserIdByPlayerNumber, setAdmin } from "@fb/admin-core";
import { ADMIN_ROLES, PERMISSIONS, type AdminRole } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { localizeAdminError } from "@/lib/admin-error";

export interface AdminMgmtState {
  ok?: boolean;
  message?: string;
  error?: string;
}

async function actorIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export async function appointAction(
  _prev: AdminMgmtState,
  formData: FormData,
): Promise<AdminMgmtState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.ADMIN_MANAGE);
    const pnRaw = String(formData.get("playerNumber") ?? "").trim();
    const role = String(formData.get("role") ?? "") as AdminRole;
    if (!/^\d+$/.test(pnRaw)) return { error: "أدخل رقم لاعب صحيحًا." };
    if (!ADMIN_ROLES.includes(role)) return { error: "اختر صلاحية صحيحة." };
    const targetUserId = await findUserIdByPlayerNumber(Number(pnRaw));
    if (!targetUserId) return { error: "المستخدم غير موجود." };
    await setAdmin({ actorUserId: ctx.userId, targetUserId, role, ip: await actorIp() });
    revalidatePath("/admin/admins");
    return { ok: true, message: "تم التعيين." };
  } catch (e) {
    return { error: localizeAdminError(e) };
  }
}
