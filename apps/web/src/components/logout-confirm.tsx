"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButtons } from "@/components/confirm-buttons";

/**
 * Logout with a confirm step. Wraps the existing sign-out server action in the
 * same two-step flow as "close table": the trigger opens the confirm; only the
 * confirm button (type=submit) actually runs the action. Cancel just closes.
 * The logout behavior itself is unchanged — this only intercepts it.
 */
export function LogoutConfirm({ action }: { action: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);

  return (
    <form action={action}>
      {open ? (
        <ConfirmButtons
          confirmLabel="تأكيد الخروج"
          confirmType="submit"
          onCancel={() => setOpen(false)}
        />
      ) : (
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
          خروج
        </Button>
      )}
    </form>
  );
}
