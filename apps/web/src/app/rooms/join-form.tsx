"use client";

import { useActionState } from "react";
import { joinByCode, type JoinState } from "./actions";

/** Join-by-invite-code form. */
export function JoinForm() {
  const [state, action, pending] = useActionState<JoinState | undefined, FormData>(
    joinByCode,
    undefined,
  );

  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      <div className="field">
        <label htmlFor="inviteCode">كود الدعوة</label>
        <input
          id="inviteCode"
          name="inviteCode"
          className="input num"
          placeholder="ABCD1234"
          autoCapitalize="characters"
          required
        />
      </div>
      <button type="submit" className="btn btn-accent block" disabled={pending}>
        {pending ? "جارٍ الدخول…" : "دخول بالكود"}
      </button>
    </form>
  );
}
