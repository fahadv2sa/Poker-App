"use client";

import { useEffect, useState } from "react";

/**
 * Brief notice shown on the home page when the user was redirected here from a
 * closed/ABANDONED table link (`/?closed=1`). Strips the `closed` flag from the
 * URL silently (history.replaceState — no Next navigation/re-render, so the
 * toast isn't cut short) and auto-dismisses after a few seconds.
 */
export function RoomClosedNotice() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
    const t = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;
  return (
    <div
      role="alert"
      className="lu-frame fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[90%] rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-[var(--lu-ember-glow)] shadow-xl"
    >
      انتهت هذه الغرفة
    </div>
  );
}
