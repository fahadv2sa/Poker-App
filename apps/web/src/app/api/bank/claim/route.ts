import { NextResponse } from "next/server";
import { BankLimitError, claimFromBank } from "@fp/db";
import { auth } from "@/auth";
import { bankRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/bank/claim (Section 13) — credit 1000 Coins, max 2× per rolling 24h.
 * Session-protected; the limit + credit run atomically through the ledger with a
 * row lock (claimFromBank). Never bypasses applyWalletTransaction.
 */
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" },
      { status: 401 },
    );
  }
  if (!bankRateLimit(userId)) {
    return NextResponse.json(
      { error: "RATE_LIMITED", messageAr: "طلبات كثيرة، يُرجى المحاولة بعد قليل" },
      { status: 429 },
    );
  }

  try {
    const res = await claimFromBank(userId);
    return NextResponse.json({
      amount: res.amount.toString(),
      balance: res.balance.toString(),
      claimsInWindow: res.claimsInWindow,
      remaining: res.remaining,
      nextResetAt: res.nextResetAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof BankLimitError) {
      return NextResponse.json(
        { error: err.code, messageAr: err.message, retryAt: err.retryAt.toISOString() },
        { status: 429 },
      );
    }
    console.error("bank claim failed", err);
    return NextResponse.json(
      { error: "INTERNAL", messageAr: "حدث خطأ غير متوقع" },
      { status: 500 },
    );
  }
}
