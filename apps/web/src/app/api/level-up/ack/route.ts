import { NextResponse } from "next/server";
import { acknowledgeLevelUp } from "@fp/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

/**
 * POST /api/level-up/ack — the player saw the level-up celebration; advance their
 * `celebrated_level` to the current level so it won't fire again for this level
 * (server-authoritative once-per-level-up). Auth-gated; idempotent.
 */
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  try {
    await acknowledgeLevelUp(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("level-up ack failed", err);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
