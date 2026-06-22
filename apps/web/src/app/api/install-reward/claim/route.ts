import { NextResponse } from "next/server";
import { grantInstallReward } from "@fp/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

/**
 * POST /api/install-reward/claim — grant the one-time 10,000-coin "add to home
 * screen" reward. Server-authoritative and idempotent: grantInstallReward only
 * credits if the account hasn't claimed before (per-account flag + ledger
 * reference). The client calls this on a real install signal (appinstalled /
 * standalone), but the server is the sole decider — it never trusts the caller
 * beyond their authenticated identity, and never grants twice.
 */
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" }, { status: 401 });
  }
  try {
    const res = await grantInstallReward(userId);
    return NextResponse.json({
      granted: res.granted,
      amount: res.amount.toString(),
      balance: res.balance.toString(),
    });
  } catch (err) {
    console.error("install reward grant failed", err);
    return NextResponse.json({ error: "INTERNAL", messageAr: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
