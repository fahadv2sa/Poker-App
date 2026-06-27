"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Requests the level-based daily top-up. The server is authoritative for both the
 * amount (level × 1000) and the once-per-day rule; this only triggers it and
 * reflects the result.
 */
export function ClaimButton({ amount, claimedToday }: { amount: string; claimedToday: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function claim() {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/bank/claim", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.messageAr ?? "تعذّر تنفيذ الطلب" });
        return;
      }
      setMsg({ kind: "ok", text: `تمت إضافة ${data.amount} كوين. رصيدك الآن ${data.balance}.` });
      router.refresh();
    } catch {
      setMsg({ kind: "err", text: "تعذّر الاتصال بالخادم" });
    } finally {
      setPending(false);
    }
  }

  const canClaim = !claimedToday;
  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={claim}
        disabled={pending || !canClaim}
        size="lg"
        className={canClaim ? "btn-gold-cta w-full" : "w-full"}
      >
        {pending
          ? "جارٍ الطلب…"
          : canClaim
            ? `🪙 اسحب ${amount} كوين`
            : "تم سحب مكافأة اليوم"}
      </Button>
      {msg ? (
        <div
          className={
            msg.kind === "ok"
              ? "rounded-md border border-[var(--lu-gold-1)]/40 bg-[var(--lu-gold-2)]/10 px-3 py-2 text-sm text-[var(--lu-gold-1)]"
              : "rounded-md border border-[#d9694f]/40 bg-[#d9694f]/10 px-3 py-2 text-sm text-[#d9694f]"
          }
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}
