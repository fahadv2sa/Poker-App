"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** One room card's data — all pulled from the backend (server component). */
export interface RoomCardData {
  id: string;
  roomName: string;
  creator: string;
  difficulty: string;
  maxPlayers: number;
  /** Seats currently filled (live incl. bots for Public; humans for Friends). */
  filled: number;
  /** Bots present (Public rooms only). */
  bots: number;
  mode: "MANUAL" | "AUTO";
  /** Password-protected (Friends/manual rooms only). */
  locked: boolean;
  kind: "PUBLIC" | "FRIENDS";
}

const DIFFICULTY_AR: Record<string, string> = {
  EASY: "سهل",
  MEDIUM: "متوسط",
  ELITE: "النخبة",
};
const DIFFICULTY_TONE: Record<string, string> = {
  EASY: "var(--primary)",
  MEDIUM: "var(--accent)",
  ELITE: "var(--gold)",
};

/** Cinematic, premium room card. Presentational only — links to the table. */
function RoomCard({ r }: { r: RoomCardData }) {
  const tone = DIFFICULTY_TONE[r.difficulty] ?? "var(--accent)";
  const pct = r.maxPlayers > 0 ? Math.min(100, (r.filled / r.maxPlayers) * 100) : 0;
  const isPublic = r.kind === "PUBLIC";
  return (
    <Link
      href={`/table/${r.id}`}
      className="room-card group relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4 sm:p-5"
    >
      {/* difficulty-tinted glow corner */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full opacity-50 blur-2xl transition group-hover:opacity-80"
        style={{ background: `radial-gradient(circle, color-mix(in oklch, ${tone} 40%, transparent), transparent 70%)` }}
      />

      {/* header: name + mode/lock badges */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl text-xl"
            style={{
              background: `color-mix(in oklch, ${tone} 16%, transparent)`,
              border: `1px solid color-mix(in oklch, ${tone} 34%, transparent)`,
            }}
            aria-hidden
          >
            {isPublic ? "⚡" : r.locked ? "🔒" : "♣"}
          </span>
          <div className="min-w-0">
            <strong className="block truncate text-base leading-tight">{r.roomName}</strong>
            <span className="text-xs text-muted-foreground">المنشئ: {r.creator}</span>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[0.66rem] font-bold",
            r.mode === "AUTO"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-accent/40 bg-accent/10 text-accent",
          )}
        >
          {r.mode === "AUTO" ? "تلقائي" : "يدوي"}
        </span>
      </div>

      {/* meta row: difficulty + players */}
      <div className="relative flex flex-wrap items-center gap-2 text-xs">
        <span
          className="rounded-full px-2.5 py-1 font-bold"
          style={{
            color: tone,
            background: `color-mix(in oklch, ${tone} 12%, transparent)`,
            border: `1px solid color-mix(in oklch, ${tone} 35%, transparent)`,
          }}
        >
          مستوى اللعب: {DIFFICULTY_AR[r.difficulty] ?? r.difficulty}
        </span>
        {isPublic && r.bots > 0 ? (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-bold text-gold">
            مقعد بوت متاح
          </span>
        ) : null}
        {!isPublic && r.locked ? (
          <span className="rounded-full border border-border/70 px-2.5 py-1 text-muted-foreground">
            خاصة
          </span>
        ) : null}
      </div>

      {/* players progress */}
      <div className="relative">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">اللاعبون</span>
          <span className="num font-bold">
            {r.filled} / {r.maxPlayers}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tone}, color-mix(in oklch, ${tone} 60%, white))` }}
          />
        </div>
      </div>

      {/* CTA */}
      <div className="relative mt-0.5 flex items-center justify-between">
        <span className="text-[0.7rem] text-muted-foreground">
          {isPublic ? "انضمام بعد انتهاء الجولة الحالية" : r.locked ? "تتطلب كلمة مرور" : "متاحة للدخول"}
        </span>
        <span
          className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-bold text-primary transition group-hover:bg-primary/20"
        >
          {isPublic ? "دخول →" : r.locked ? "🔒 دخول" : "دخول →"}
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
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}

/** Two filters (Public = Quick Play rooms / Friends = manual rooms) + the cards. */
export function RoomBrowser({
  publicRooms,
  friendsRooms,
}: {
  publicRooms: RoomCardData[];
  friendsRooms: RoomCardData[];
}) {
  const [tab, setTab] = useState<"public" | "friends">("public");
  const rooms = tab === "public" ? publicRooms : friendsRooms;

  const Tab = ({ id, label, count }: { id: "public" | "friends"; label: string; count: number }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition",
        tab === id
          ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "num rounded-full px-1.5 text-[0.66rem]",
          tab === id ? "bg-primary/20 text-primary" : "bg-white/8 text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div className="relative z-10">
      <div className="mb-4 flex gap-2 rounded-2xl border border-border/70 bg-card/50 p-1.5 backdrop-blur">
        <Tab id="public" label="الغرف العامة" count={publicRooms.length} />
        <Tab id="friends" label="غرف الأصدقاء" count={friendsRooms.length} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {rooms.length === 0 ? (
          tab === "public" ? (
            <EmptyState glyph="⚡" text="لا توجد غرف عامة نشطة الآن — جرّب اللعب السريع!" />
          ) : (
            <EmptyState glyph="♣" text="لا توجد غرف أصدقاء مفتوحة — أنشئ واحدة!" />
          )
        ) : (
          rooms.map((r) => <RoomCard key={r.id} r={r} />)
        )}
      </div>
    </div>
  );
}
