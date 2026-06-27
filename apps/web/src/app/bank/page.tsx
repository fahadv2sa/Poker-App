import { redirect } from "next/navigation";
import { getBankStatus, getBankHistory, prisma } from "@fb/db";
import { auth } from "@/auth";
import { BankView } from "@/components/games/bank-view";

export const dynamic = "force-dynamic";

/** Format a UTC instant in the bank's reference timezone (Asia/Riyadh). */
function riyadhDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
function riyadhTime(d: Date): string {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function BankPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [wallet, status, history] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
    getBankStatus(userId),
    getBankHistory(userId, 20),
  ]);

  const balance = wallet?.balance.toString() ?? "0";
  const amount = status.amount.toString();
  const resetText = riyadhTime(status.nextResetAt);

  // Pre-format history (dates/amounts) here so the view stays pure presentation.
  const historyRows = history.map((h) => ({
    when: riyadhDateTime(h.claimedAt),
    amount: h.amount.toString(),
    balanceAfter: h.balanceAfter != null ? h.balanceAfter.toString() : "—",
    level: h.level ?? null,
  }));

  return (
    <BankView
      balance={balance}
      amount={amount}
      claimedToday={status.claimedToday}
      resetText={resetText}
      history={historyRows}
    />
  );
}
