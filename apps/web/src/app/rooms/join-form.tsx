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
    <form action={action} className="flex flex-col gap-4">
      {state?.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
          {state.error}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="inviteCode">كود الدعوة</Label>
        <Input
          id="inviteCode"
          name="inviteCode"
          className="num"
          placeholder="ABCD1234"
          autoCapitalize="characters"
          required
        />
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {pending ? "جارٍ الدخول…" : "دخول بالكود"}
      </Button>
    </form>
  );
}
