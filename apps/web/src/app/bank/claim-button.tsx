"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Requests a 1000-coin top-up; the server enforces the 2×/24h limit. */
export function ClaimButton({ canClaim }: { canClaim: boolean }) {
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

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={claim} disabled={pending || !canClaim} className="w-full">
        {pending ? "جارٍ الطلب…" : canClaim ? "اطلب 1000 كوين" : "بلغت الحد لهذه الفترة"}
      </Button>
      {msg ? (
        <div
          className={
            msg.kind === "ok"
              ? "rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary"
              : "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
          }
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}
