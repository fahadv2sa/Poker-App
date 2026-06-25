"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { recordAdminAction } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { adminGameServerClient } from "@/lib/admin-gameserver";

export interface LiveActionState {
  ok?: boolean;
  message?: string;
  error?: string;
}

async function actorIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export async function forceCloseAction(
  gameId: string,
  _prev: LiveActionState,
  _fd: FormData,
): Promise<LiveActionState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.GAMES_FORCE_CLOSE);
    const result = await adminGameServerClient().forceCloseRoom(gameId);
    await recordAdminAction({
      actorUserId: ctx.userId,
      action: "games.force_close",
      targetType: "game",
      targetId: gameId,
      after: { result },
      ip: await actorIp(),
    });
    revalidatePath("/admin/live");
    if (result === "closed") return { ok: true, message: "أُغلقت الطاولة." };
    if (result === "not_found") return { error: "الطاولة غير موجودة (ربما أُغلقت)." };
    return { error: "خادم اللعب غير متاح." };
  } catch {
    return { error: "تعذّر تنفيذ العملية." };
  }
}

export async function kickSeatAction(
  gameId: string,
  seat: number,
  _prev: LiveActionState,
  _fd: FormData,
): Promise<LiveActionState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.GAMES_KICK_SEAT);
    const result = await adminGameServerClient().kickSeat(gameId, seat);
    await recordAdminAction({
      actorUserId: ctx.userId,
      action: "games.kick_seat",
      targetType: "game",
      targetId: gameId,
      after: { seat, result },
      ip: await actorIp(),
    });
    revalidatePath("/admin/live");
    if (result === "kicked") return { ok: true, message: "تم إخراج اللاعب." };
    if (result === "no_seat") return { error: "لا لاعب متصل في هذا المقعد." };
    if (result === "not_found") return { error: "الطاولة غير موجودة." };
    return { error: "خادم اللعب غير متاح." };
  } catch {
    return { error: "تعذّر تنفيذ العملية." };
  }
}

export async function toggleBotsAction(
  paused: boolean,
  _prev: LiveActionState,
  _fd: FormData,
): Promise<LiveActionState> {
  try {
    const ctx = await requireAdminCan(PERMISSIONS.BOTS_TOGGLE);
    const meta = await adminGameServerClient().setBotsPaused(paused);
    await recordAdminAction({
      actorUserId: ctx.userId,
      action: "bots.toggle",
      after: { paused: meta.paused },
      ip: await actorIp(),
    });
    revalidatePath("/admin/live");
    return { ok: true, message: meta.paused ? "أُوقفت تعبئة البوتات." : "استؤنفت تعبئة البوتات." };
  } catch {
    return { error: "تعذّر تنفيذ العملية." };
  }
}
