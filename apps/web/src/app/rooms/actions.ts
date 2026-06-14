"use server";

import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
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
  if (game.status === "ENDED" || game.status === "ABANDONED") {
    return { error: "انتهت هذه الغرفة" };
  }

  redirect(`/table/${game.id}`);
}
