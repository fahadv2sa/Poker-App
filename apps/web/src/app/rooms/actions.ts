"use server";

import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";

export interface JoinState {
  error?: string;
}

/** Resolve an invite code to a game and head to its table. */
export async function joinByCode(
  _prev: JoinState | undefined,
  formData: FormData,
): Promise<JoinState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const code = String(formData.get("inviteCode") ?? "").trim().toUpperCase();
  if (code.length < 4) return { error: "كود الدعوة غير صالح" };

  const game = await prisma.game.findUnique({
    where: { inviteCode: code },
    select: { id: true, status: true },
  });
  if (!game) return { error: "لا توجد غرفة بهذا الكود" };
  // Only ABANDONED is terminal/closed. ENDED is transient (between hands of a
  // still-live session), so a code holder can still rejoin an open room — the
  // server re-seats existing members and gates new entry (password/Quick Play).
  if (game.status === "ABANDONED") {
    return { error: "انتهت هذه الغرفة" };
  }

  redirect(`/table/${game.id}`);
}
