"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Password + confirm-password inputs with a LIVE match indicator (green when they
 * match, red when they don't). Reused by signup and password reset. Reports
 * validity (both filled + matching) via `onValidityChange` so the parent can
 * disable submit until the passwords match. The inputs are named `password` /
 * `confirmPassword`, so a plain <form> still submits them.
 */
export function PasswordConfirmFields({
  passwordLabel = "كلمة المرور",
  onValidityChange,
}: {
  passwordLabel?: string;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const bothFilled = password.length > 0 && confirm.length > 0;
  const matches = password === confirm;
  const showIndicator = bothFilled;

  useEffect(() => {
    onValidityChange?.(bothFilled && matches);
  }, [bothFilled, matches, onValidityChange]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-[var(--lu-cream)]">{passwordLabel}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="٨ أحرف على الأقل"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword" className="text-[var(--lu-cream)]">تأكيد كلمة المرور</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="أعد إدخال كلمة المرور"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={showIndicator && !matches}
          required
        />
        {showIndicator ? (
          matches ? (
            <p className="flex items-center gap-1 text-xs font-bold text-[var(--lu-gold-1)]">
              ✓ كلمتا المرور متطابقتان
            </p>
          ) : (
            <p className="flex items-center gap-1 text-xs font-bold text-[#d9694f]">
              ✕ كلمتا المرور غير متطابقتين
            </p>
          )
        ) : null}
      </div>
    </>
  );
}
