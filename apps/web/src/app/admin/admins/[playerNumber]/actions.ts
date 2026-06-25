"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  findUserIdByPlayerNumber,
  grantPermission,
  removeAdmin,
  revokePermission,
  setAdmin,
  setAdminStatus,
} from "@fb/admin-core";
import { PERMISSIONS, type AdminRole } from "@fb/shared";
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

export async function setRoleAction(
  playerNumber: number,
  role: AdminRole,
  _prev: AdminMgmtState,
  _fd: FormData,
): Promise<AdminMgmtState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.ADMIN_MANAGE);
    const target = await findUserIdByPlayerNumber(playerNumber);
    if (!target) return { error: "المستخدم غير موجود." };
    await setAdmin({ actorUserId: ctx.userId, targetUserId: target, role, ip: await actorIp() });
    revalidatePath(`/admin/admins/${playerNumber}`);
    return { ok: true, message: "تم التحديث." };
  } catch (e) {
    return { error: localizeAdminError(e) };
  }
}

export async function setStatusAction(
  playerNumber: number,
  status: "ACTIVE" | "SUSPENDED",
  _prev: AdminMgmtState,
  _fd: FormData,
): Promise<AdminMgmtState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.ADMIN_MANAGE);
    const target = await findUserIdByPlayerNumber(playerNumber);
    if (!target) return { error: "المستخدم غير موجود." };
    await setAdminStatus({ actorUserId: ctx.userId, targetUserId: target, status, ip: await actorIp() });
    revalidatePath(`/admin/admins/${playerNumber}`);
    return { ok: true, message: status === "SUSPENDED" ? "تم الإيقاف." : "تم التفعيل." };
  } catch (e) {
    return { error: localizeAdminError(e) };
  }
}

export async function togglePermAction(
  playerNumber: number,
  permissionKey: string,
  grant: boolean,
  _prev: AdminMgmtState,
  _fd: FormData,
): Promise<AdminMgmtState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.ADMIN_MANAGE);
    const target = await findUserIdByPlayerNumber(playerNumber);
    if (!target) return { error: "المستخدم غير موجود." };
    if (grant) {
      await grantPermission({ actorUserId: ctx.userId, targetUserId: target, permissionKey, ip: await actorIp() });
    } else {
      await revokePermission({ actorUserId: ctx.userId, targetUserId: target, permissionKey, ip: await actorIp() });
    }
    revalidatePath(`/admin/admins/${playerNumber}`);
    return { ok: true };
  } catch (e) {
    return { error: localizeAdminError(e) };
  }
}

export async function removeAction(
  playerNumber: number,
  _prev: AdminMgmtState,
  _fd: FormData,
): Promise<AdminMgmtState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.ADMIN_MANAGE);
    const target = await findUserIdByPlayerNumber(playerNumber);
    if (!target) return { error: "المستخدم غير موجود." };
    await removeAdmin({ actorUserId: ctx.userId, targetUserId: target, ip: await actorIp() });
  } catch (e) {
    return { error: localizeAdminError(e) };
  }
  redirect("/admin/admins");
}
