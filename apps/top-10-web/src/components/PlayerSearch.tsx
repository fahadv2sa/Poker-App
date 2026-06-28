"use client";
import { memo, useEffect, useRef, useState } from "react";

interface Found {
  id: string;
  name: string;
  nameAr: string;
}

/**
 * Filtered player input (brief §6.5): type a prefix (Arabic or English, first or
 * last name) → a live-filtered list of REAL players → select one. No free-text
 * submission, so typos can't happen. The selected id is sent to the server.
 */
function PlayerSearchInner({ disabled, onPick }: { disabled: boolean; onPick: (playerId: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { players: Found[] };
        setResults(data.players ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  function pick(p: Found) {
    onPick(p.id);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="relative w-full">
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder={disabled ? "ليس دورك الآن…" : "اكتب اسم اللاعب…"}
        className="w-full rounded-xl border border-[var(--border)] bg-black/50 px-4 py-3 text-lg text-[var(--lu-cream)] outline-none focus:border-[var(--gold)] disabled:opacity-50"
      />
      {open && results.length > 0 && !disabled && (
        <ul className="lu-frame absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl p-1">
          {results.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => pick(p)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-right hover:bg-white/5"
              >
                <span className="font-semibold text-[var(--lu-cream)]">{p.nameAr}</span>
                <span className="num text-xs text-[var(--lu-tan)]">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Memoized: re-renders only when `disabled` or `onPick` change — not on every
 *  socket state update — so typing stays smooth while the board updates. */
export const PlayerSearch = memo(PlayerSearchInner);
