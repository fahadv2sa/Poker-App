"use client";

import { useEffect, useState } from "react";

const KEY = "tt_coach_seen";

/**
 * One-time, single-line onboarding nudge above the search bar ("type a player you think
 * is on the list"). Shows once ever (localStorage), only while `active` (the player's
 * first round), and fades on dismiss or after a short while. Onboarding through a tool,
 * not a rules board — the banner + shimmering slots + reveal notice teach the rest.
 */
export function TenCoachmark({ active }: { active: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) return;
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {
      /* ignore */
    }
    if (seen) return;
    setShow(true);
    const t = setTimeout(() => dismiss(), 8000);
    return () => clearTimeout(t);
  }, [active]);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!show) return null;
  return (
    <div className="mb-1 flex items-center justify-between gap-2 rounded-xl border border-[var(--lu-gold-1)]/35 bg-[var(--gold)]/10 px-3 py-1.5 text-[0.74rem] text-[var(--lu-cream)]">
      <span>💡 اكتب اسم لاعب تظنّه ضمن القائمة — كل بطاقة تكشفها تمنحك نقاطًا بحسب مركزها.</span>
      <button onClick={dismiss} aria-label="إغلاق" className="shrink-0 rounded-full px-1.5 text-[var(--lu-tan)] hover:text-[var(--lu-cream)]">✕</button>
    </div>
  );
}
