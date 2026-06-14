import { NextResponse } from "next/server";
import { signOut } from "@/auth";

export const runtime = "nodejs";

/** POST /api/auth/logout — clears the session cookie (Section 13). */
export async function POST() {
  await signOut({ redirect: false });
  return NextResponse.json({ ok: true });
}
