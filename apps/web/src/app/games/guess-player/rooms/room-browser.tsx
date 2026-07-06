"use client";
import { useState } from "react";
import Link from "next/link";
import { cn } from "@fb/top-10-ui";

/** One room card's data (from the live server read). */
export interface RoomCardData {
  id: string;
  code: string | null;
  name: string | null;
  creator: string;
  mode: "VS_SYSTEM" | "VS_HUMANS";
  difficulty: string | null;
  maxPlayers: number;
  filled: number;
  kind: "PUBLIC" | "FRIENDS";
}

const DIFFICULTY_AR: Record<string, string> = { EASY: "سهل", MEDIUM: "متوسط", HARD: "صعب" };
const DIFFICULTY_TONE: Record<string, string> = { EASY: "var(--fb-gold-strong)", MEDIUM: "var(--fb-ember)", HARD: "var(--fb-gold)" };

/** Cinematic room card (copied from Top Ten's, with the mode chip added). */
function RoomCard({ r }: { r: RoomCardData }) {
  const tone = (r.difficulty && DIFFICULTY_TONE[r.difficulty]) ?? "var(--fb-gold-strong)";
  const pct = r.maxPlayers > 0 ? Math.min(100, (r.filled / r.maxPlayers) * 100) : 0;
  const isPublic = r.kind === "PUBLIC";
  const href = isPublic
    ? "/games/guess-player/play"
    : r.code
      ? `/games/guess-player/play?join=${encodeURIComponent(r.code)}`
      : "/games/guess-player/play";

  return (
    <Link href={href} className="lu-frame lu-btn group relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full opacity-50 blur-2xl transition group-hover:opacity-80"
        style={{ background: `radial-gradient(circle, color-mix(in oklch, ${tone} 40%, transparent), transparent 70%)` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl text-xl"
            style={{ background: `color-mix(in oklch, ${tone} 16%, transparent)`, border: `1px solid color-mix(in oklch, ${tone} 34%, transparent)` }}
            aria-hidden
          >
            {isPublic ? "⚡" : "🔒"}
          </span>
          <div className="min-w-0">
            <strong className="block truncate text-base leading-tight text-[var(--lu-cream)]">
              {isPublic ? "طاولة سريعة" : r.name?.trim() || `غرفة ${r.creator}`}
            </strong>
            <span className="text-xs text-[var(--lu-tan)]">المنشئ: {r.creator}</span>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-bold ring-1",
            isPublic ? "text-[var(--lu-ember-glow)] ring-[var(--lu-ember)]/40" : "text-[var(--lu-gold-1)] ring-[var(--lu-gold-1)]/40",
          )}
        >
          {isPublic ? "عامة" : "خاصة"}
        </span>
      </div>

      <div className="relative flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full px-2.5 py-1 font-bold text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/35">
          {r.mode === "VS_HUMANS" ? "🎯 ضد الأصدقاء" : "🤖 ضد المنصة"}
        </span>
        {r.difficulty ? (
          <span
            className="rounded-full px-2.5 py-1 font-bold"
            style={{ color: tone, background: `color-mix(in oklch, ${tone} 12%, transparent)`, border: `1px solid color-mix(in oklch, ${tone} 35%, transparent)` }}
          >
            المستوى: {DIFFICULTY_AR[r.difficulty] ?? r.difficulty}
          </span>
        ) : null}
      </div>

      <div className="relative">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-[var(--lu-tan)]">اللاعبون</span>
          <span className="num font-bold text-[var(--lu-cream)]">
            {r.filled} / {r.maxPlayers}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tone}, color-mix(in oklch, ${tone} 60%, white))` }} />
        </div>
      </div>

      <div className="relative mt-0.5 flex items-center justify-between">
        <span className="text-[0.7rem] text-[var(--lu-tan)]">{isPublic ? "مطابقة فورية" : "متاحة للدخول"}</span>
        <span className="rounded-full px-3 py-1 text-sm font-bold text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/40 transition group-hover:bg-[var(--lu-gold-1)]/10">
          {isPublic ? "العب سريع →" : "دخول →"}
        </span>
      </div>
    </Link>
  );
}

function EmptyState({ text, glyph }: { text: string; glyph: string }) {
  return (
    <div className="col-span-full flex flex-col items-center gap-2 py-12 text-center">
      <span className="text-3xl opacity-60" aria-hidden>
        {glyph}
      </span>
      <p className="text-[var(--lu-tan)]">{text}</p>
    </div>
  );
}

export function RoomBrowser({ publicRooms, friendsRooms }: { publicRooms: RoomCardData[]; friendsRooms: RoomCardData[] }) {
  const [tab, setTab] = useState<"public" | "friends">("public");
  const rooms = tab === "public" ? publicRooms : friendsRooms;

  const Tab = ({ id, label, count }: { id: "public" | "friends"; label: string; count: number }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition",
        tab === id ? "lu-chip text-[var(--lu-gold-1)]" : "text-[var(--lu-tan)] hover:text-[var(--lu-cream)]",
      )}
    >
      {label}
      <span
        className={cn(
          "num rounded-full px-1.5 text-[0.66rem]",
          tab === id ? "text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/40" : "bg-white/[0.08] text-[var(--lu-tan)]",
        )}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div className="relative z-10">
      <div className="lu-frame mb-4 flex gap-2 rounded-2xl p-1.5">
        <Tab id="public" label="الغرف العامة" count={publicRooms.length} />
        <Tab id="friends" label="غرف الأصدقاء" count={friendsRooms.length} />
      </div>

      <div className="grid gap-3">
        {rooms.length === 0 ? (
          tab === "public" ? (
            <EmptyState glyph="⚡" text="لا توجد طاولات سريعة نشطة الآن" />
          ) : (
            <EmptyState glyph="🔒" text="لا توجد غرف أصدقاء مفتوحة" />
          )
        ) : (
          rooms.map((r) => <RoomCard key={r.id} r={r} />)
        )}
      </div>
    </div>
  );
}
