"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Join-by-invite-code — mirrors Link Up's JoinForm (label + input + gold CTA). */
export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (c) router.push(`/games/top-10/play?join=${encodeURIComponent(c)}`);
      }}
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor="inviteCode" className="flex items-center gap-2 text-sm leading-none font-medium text-[var(--lu-cream)]">
          كود الدعوة
        </label>
        <input
          id="inviteCode"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD1234"
          autoCapitalize="characters"
          required
          className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none num text-[var(--lu-cream)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={!code.trim()}
        className="btn-gold-cta inline-flex h-9 shrink-0 items-center justify-center rounded-md px-4 text-sm font-bold text-black disabled:pointer-events-none disabled:opacity-50"
      >
        دخول بالكود
      </button>
    </form>
  );
}
