"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The confirm/cancel pair used by every destructive action, mirroring the
 * existing "close table" two-step flow (a destructive confirm + a ghost cancel
 * that replaces the trigger). Each caller owns its own open/closed state and
 * renders either its trigger or this pair — keeping one consistent look.
 *
 * `confirmType="submit"` lets it live inside a <form> (e.g. logout) so the
 * confirm button submits the existing server action unchanged.
 */
export function ConfirmButtons({
  confirmLabel,
  onConfirm,
  onCancel,
  confirmType = "button",
  size = "sm",
  className,
}: {
  confirmLabel: ReactNode;
  onConfirm?: () => void;
  onCancel: () => void;
  confirmType?: "button" | "submit";
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1", className)}>
      <Button type={confirmType} variant="destructive" size={size} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size={size} onClick={onCancel}>
        إلغاء
      </Button>
    </span>
  );
}
