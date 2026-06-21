"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Accept / reject an incoming friend request (server-authoritative). */
export function RespondRequestButtons({ playerNumber }: { playerNumber: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function respond(action: "accept" | "reject") {
    setBusy(true);
    try {
      const res = await fetch("/api/social/friend/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerNumber, action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex shrink-0 gap-2">
      <Button size="sm" disabled={busy} onClick={() => respond("accept")}>
        قبول
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        className="text-destructive hover:text-destructive"
        onClick={() => respond("reject")}
      >
        رفض
      </Button>
    </div>
  );
}
