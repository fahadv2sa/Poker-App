"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinByCode, type JoinState } from "./actions";

/** Join-by-invite-code form. */
export function JoinForm() {
  const [state, action, pending] = useActionState<JoinState | undefined, FormData>(
    joinByCode,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      {state?.error ? (
        <div className="rounded-md border border-[var(--fb-danger)]/40 bg-[var(--fb-danger)]/10 px-3 py-2 text-sm text-[var(--fb-danger)] sm:order-last sm:w-full">
          {state.error}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="inviteCode" className="text-[var(--lu-cream)]">كود الدعوة</Label>
        <Input
          id="inviteCode"
          name="inviteCode"
          className="num"
          placeholder="ABCD1234"
          autoCapitalize="characters"
          required
        />
      </div>
      <Button type="submit" disabled={pending} className="btn-gold-cta text-black sm:shrink-0">
        {pending ? "جارٍ الدخول…" : "دخول بالكود"}
      </Button>
    </form>
  );
}
