"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminAdjustWallet,
  deleteUserAccount,
  findUserIdByPlayerNumber,
  setEmailVerified,
  setUserDisabled,
  setUserPassword,
} from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { hashPassword } from "@/lib/argon";

export interface ActionState {
  ok?: boolean;
  message?: string;
  error?: string;
}

async function actorIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

function localizeAdminCode(code: string): string {
  switch (code) {
    case "NONZERO":
      return "أدخل مبلغًا غير صفري.";
    case "SELF_DISABLE":
      return "لا يمكنك تعطيل حسابك.";
    case "SELF_DELETE":
      return "لا يمكنك حذف حسابك.";
    case "DELETE_ADMIN":
      return "لا يمكن حذف حساب مشرف — أزِل صلاحية الإشراف أولًا.";
    case "NOT_FOUND":
      return "المستخدم غير موجود.";
    default:
      return "تعذّر تنفيذ العملية.";
  }
}

function toError(e: unknown): ActionState {
  const name = (e as { name?: string } | null)?.name;
  const code = (e as { code?: string } | null)?.code;
  if (name === "AdminActionError") return { error: localizeAdminCode(code ?? "") };
  if (code === "INSUFFICIENT_FUNDS") return { error: "الرصيد لا يكفي لهذا الخصم." };
  return { error: "تعذّر تنفيذ العملية." };
}

export async function adjustCoinsAction(
  playerNumber: number,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.COINS_ADJUST);
    const raw = String(formData.get("amount") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    if (!/^-?\d+$/.test(raw)) return { error: "أدخل مبلغًا صحيحًا." };
    const targetUserId = await findUserIdByPlayerNumber(playerNumber);
    if (!targetUserId) return { error: "المستخدم غير موجود." };

    const res = await adminAdjustWallet({
      actorUserId: ctx.userId,
      targetUserId,
      amount: BigInt(raw),
      reason,
      ip: await actorIp(),
    });
    revalidatePath(`/admin/users/${playerNumber}`);
    return {
      ok: true,
      message: `تم التعديل. الرصيد الآن ${BigInt(res.balanceAfter).toLocaleString("en-US")}.`,
    };
  } catch (e) {
    return toError(e);
  }
}

export async function setVerifiedAction(
  playerNumber: number,
  verified: boolean,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.USERS_VERIFY_EMAIL);
    const targetUserId = await findUserIdByPlayerNumber(playerNumber);
    if (!targetUserId) return { error: "المستخدم غير موجود." };
    await setEmailVerified({ actorUserId: ctx.userId, targetUserId, verified, ip: await actorIp() });
    revalidatePath(`/admin/users/${playerNumber}`);
    return { ok: true, message: verified ? "تم التوثيق." : "أُلغي التوثيق." };
  } catch (e) {
    return toError(e);
  }
}

export async function setDisabledAction(
  playerNumber: number,
  disabled: boolean,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.USERS_BAN);
    const targetUserId = await findUserIdByPlayerNumber(playerNumber);
    if (!targetUserId) return { error: "المستخدم غير موجود." };
    await setUserDisabled({ actorUserId: ctx.userId, targetUserId, disabled, ip: await actorIp() });
    revalidatePath(`/admin/users/${playerNumber}`);
    return { ok: true, message: disabled ? "تم تعطيل الحساب." : "تم تفعيل الحساب." };
  } catch (e) {
    return toError(e);
  }
}

export async function resetPasswordAction(
  playerNumber: number,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.USERS_RESET_PASSWORD);
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) return { error: "كلمة المرور 8 أحرف على الأقل." };
    const targetUserId = await findUserIdByPlayerNumber(playerNumber);
    if (!targetUserId) return { error: "المستخدم غير موجود." };
    const passwordHash = await hashPassword(password);
    await setUserPassword({ actorUserId: ctx.userId, targetUserId, passwordHash, ip: await actorIp() });
    return { ok: true, message: "تم تعيين كلمة مرور جديدة." };
  } catch (e) {
    return toError(e);
  }
}

export async function deleteUserAction(
  playerNumber: number,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const confirm = String(formData.get("confirm") ?? "").trim();
  try {
    const ctx = await requireAdminCan(PERMISSIONS.USERS_DELETE);
    if (confirm !== String(playerNumber)) return { error: "اكتب رقم اللاعب للتأكيد." };
    const targetUserId = await findUserIdByPlayerNumber(playerNumber);
    if (!targetUserId) return { error: "المستخدم غير موجود." };
    await deleteUserAccount({ actorUserId: ctx.userId, targetUserId, ip: await actorIp() });
  } catch (e) {
    return toError(e);
  }
  // Success: the account is gone — leave the (now-dead) detail page.
  redirect("/admin/users");
}
