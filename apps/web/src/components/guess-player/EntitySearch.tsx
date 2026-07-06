"use client";
import { memo, useEffect, useRef, useState } from "react";

export interface EntityItem {
  id: string;
  label: string;
  sub?: string | null;
}

/**
 * Generic entity autocomplete — the Top Ten PlayerSearch pattern applied to
 * ANY reference entity (players, clubs, countries, competitions, trophies):
 * type a prefix → live-filtered list of REAL entities → select one. No
 * free-text submission ever reaches the server, so a question can only name
 * things that exist (the zero-error wire contract).
 */
function EntitySearchInner({
  endpoint,
  disabled,
  onPick,
  placeholder,
  itemsKey = "items",
}: {
  /** API route returning `{ [itemsKey]: EntityItem[] }` for `?q=`. */
  endpoint: string;
  disabled?: boolean;
  onPick: (item: EntityItem) => void;
  placeholder: string;
  itemsKey?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<EntityItem[]>([]);
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
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as Record<string, EntityItem[]>;
        setResults(data[itemsKey] ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, endpoint, itemsKey]);

  function pick(item: EntityItem) {
    onPick(item);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  const showList = open && results.length > 0 && !disabled;

  return (
    <div className="flex w-full flex-col">
      {showList && (
        <ul className="lu-frame z-20 mb-1.5 max-h-[34dvh] w-full overflow-auto overscroll-contain rounded-xl p-1">
          {results.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => pick(item)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-right transition hover:bg-[var(--lu-gold-2)]/10 active:bg-[var(--lu-gold-2)]/15"
              >
                <span className="font-semibold text-[var(--lu-cream)]">{item.label}</span>
                {item.sub ? <span className="text-xs text-[var(--lu-tan)]">{item.sub}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--fb-surface)] px-4 py-3 text-base text-[var(--lu-cream)] outline-none placeholder:text-[var(--lu-tan)] focus:border-[var(--gold)] disabled:opacity-50"
      />
    </div>
  );
}

export const EntitySearch = memo(EntitySearchInner);

/** Player search rows carry Arabic + English names + nationality; adapt them
 *  to the generic item shape. */
export function PlayerEntitySearch({
  disabled,
  onPick,
  placeholder,
}: {
  disabled?: boolean;
  onPick: (playerId: string) => void;
  placeholder: string;
}) {
  return (
    <PlayerSearchAdapter disabled={disabled} onPick={onPick} placeholder={placeholder} />
  );
}

function PlayerSearchAdapterInner({
  disabled,
  onPick,
  placeholder,
}: {
  disabled?: boolean;
  onPick: (playerId: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; nameAr: string; nationality: string | null }[]
  >([]);
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
        const res = await fetch(`/api/games/guess-player/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { players: typeof results };
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

  const showList = open && results.length > 0 && !disabled;

  return (
    <div className="flex w-full flex-col">
      {showList && (
        <ul className="lu-frame z-20 mb-1.5 max-h-[34dvh] w-full overflow-auto overscroll-contain rounded-xl p-1">
          {results.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  onPick(p.id);
                  setQ("");
                  setResults([]);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-right transition hover:bg-[var(--lu-gold-2)]/10 active:bg-[var(--lu-gold-2)]/15"
              >
                <span className="font-semibold text-[var(--lu-cream)]">
                  {p.nameAr}
                  {p.nationality ? (
                    <span className="mr-2 text-xs font-normal text-[var(--lu-tan)]">· {p.nationality}</span>
                  ) : null}
                </span>
                <span className="num text-xs text-[var(--lu-tan)]">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--fb-surface)] px-4 py-3 text-base text-[var(--lu-cream)] outline-none placeholder:text-[var(--lu-tan)] focus:border-[var(--gold)] disabled:opacity-50"
      />
    </div>
  );
}

const PlayerSearchAdapter = memo(PlayerSearchAdapterInner);
