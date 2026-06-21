"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Removes a friend (server-authoritative) then refreshes the list. */
export function RemoveFriendButton({ playerNumber }: { playerNumber: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/social/friend", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerNumber }),
          });
          if (res.ok) router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      إزالة
    </Button>
  );
}
