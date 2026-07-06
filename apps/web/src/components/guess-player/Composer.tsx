"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@fb/top-10-ui";
import type { GpAskInput } from "@fb/shared";
import { EntitySearch, type EntityItem } from "./EntitySearch";
import { seasonLabel } from "./question-text";

type GpTemplate = GpAskInput["template"];
type Slot = "club" | "country" | "competition" | "trophy" | "season";

/**
 * The question composer, "investigation" edition (approved design A):
 * 4 category cards → variant pills → the question rendered as a BIG Arabic
 * sentence whose holes are glowing, tappable chips — the active hole opens
 * the entity autocomplete right below it. No free text ever leaves the
 * client: holes are filled only from real-entity lists (ids), and the
 * forbidden topics have no category here at all.
 */

const CATEGORIES: ReadonlyArray<{
  id: string;
  icon: string;
  label: string;
  variants: ReadonlyArray<{ t: GpTemplate; label: string }>;
}> = [
  {
    id: "clubs",
    icon: "🏟️",
    label: "الأندية",
    variants: [
      { t: "CLUB_EVER", label: "لعب في نادٍ؟" },
      { t: "CLUB_SEASON", label: "نادٍ في موسم؟" },
    ],
  },
  {
    id: "identity",
    icon: "🌍",
    label: "الجنسية والمنتخب",
    variants: [
      { t: "NATIONALITY", label: "ما جنسيته؟" },
      { t: "NATIONAL_TEAM", label: "لأي منتخب لعب؟" },
    ],
  },
  {
    id: "competitions",
    icon: "🏆",
    label: "البطولات",
    variants: [
      { t: "COMPETITION_EVER", label: "لعب في بطولة؟" },
      { t: "COMPETITION_SEASON", label: "بطولة في موسم؟" },
    ],
  },
  {
    id: "trophies",
    icon: "🥇",
    label: "الألقاب",
    variants: [
      { t: "TROPHY_EVER", label: "فاز بلقب؟" },
      { t: "TROPHY_SEASON", label: "لقب في موسم؟" },
      { t: "TROPHY_WITH_CLUB", label: "لقب مع نادٍ؟" },
    ],
  },
];

type Segment = { text: string } | { slot: Slot };
const SENTENCES: Record<GpTemplate, Segment[]> = {
  CLUB_EVER: [{ text: "هل لعب في نادي" }, { slot: "club" }, { text: "؟" }],
  CLUB_SEASON: [
    { text: "هل لعب في نادي" },
    { slot: "club" },
    { text: "موسم" },
    { slot: "season" },
    { text: "؟" },
  ],
  NATIONALITY: [{ text: "هل جنسيته" }, { slot: "country" }, { text: "؟" }],
  NATIONAL_TEAM: [{ text: "هل لعب لمنتخب" }, { slot: "country" }, { text: "؟" }],
  COMPETITION_EVER: [{ text: "هل لعب في" }, { slot: "competition" }, { text: "؟" }],
  COMPETITION_SEASON: [
    { text: "هل لعب في" },
    { slot: "competition" },
    { text: "موسم" },
    { slot: "season" },
    { text: "؟" },
  ],
  TROPHY_EVER: [{ text: "هل فاز بلقب" }, { slot: "trophy" }, { text: "؟" }],
  TROPHY_SEASON: [
    { text: "هل فاز بلقب" },
    { slot: "trophy" },
    { text: "موسم" },
    { slot: "season" },
    { text: "؟" },
  ],
  TROPHY_WITH_CLUB: [
    { text: "هل فاز بلقب" },
    { slot: "trophy" },
    { text: "مع نادي" },
    { slot: "club" },
    { text: "؟" },
  ],
};

const SLOT_META: Record<Slot, { word: string; icon: string }> = {
  club: { word: "نادٍ", icon: "🏟️" },
  country: { word: "دولة", icon: "🌍" },
  competition: { word: "بطولة", icon: "🏆" },
  trophy: { word: "لقب", icon: "🥇" },
  season: { word: "موسم", icon: "📅" },
};

const SLOT_ENDPOINT: Record<Exclude<Slot, "season">, { url: string; placeholder: string }> = {
  club: { url: "/api/games/guess-player/entities/clubs", placeholder: "اكتب اسم النادي… (مثال: ريال مدريد)" },
  country: { url: "/api/games/guess-player/entities/countries", placeholder: "اكتب اسم الدولة… (مثال: البرازيل)" },
  competition: { url: "/api/games/guess-player/entities/competitions", placeholder: "اكتب اسم البطولة… (مثال: الدوري الإسباني)" },
  trophy: { url: "/api/games/guess-player/entities/trophies", placeholder: "اكتب اسم اللقب… (مثال: دوري أبطال أوروبا)" },
};

const SEASONS = Array.from({ length: 2026 - 1990 + 1 }, (_, i) => 2026 - i);

type Picked = Partial<Record<Slot, { id: string; label: string }>>;

export function Composer({ disabled, onAsk }: { disabled?: boolean; onAsk: (input: GpAskInput) => void }) {
  const [categoryId, setCategoryId] = useState<string>("clubs");
  const [template, setTemplate] = useState<GpTemplate>("CLUB_EVER");
  const [picked, setPicked] = useState<Picked>({});
  const [activeSlot, setActiveSlot] = useState<Slot | null>("club");

  const category = CATEGORIES.find((c) => c.id === categoryId)!;
  const segments = SENTENCES[template];
  const slots = useMemo(
    () => segments.filter((s): s is { slot: Slot } => "slot" in s).map((s) => s.slot),
    [segments],
  );
  const firstEmpty = slots.find((s) => !picked[s]) ?? null;
  const currentSlot = activeSlot && !picked[activeSlot] ? activeSlot : firstEmpty;
  const complete = slots.every((s) => picked[s]);

  function selectCategory(id: string) {
    const cat = CATEGORIES.find((c) => c.id === id)!;
    setCategoryId(id);
    selectTemplate(cat.variants[0]!.t);
  }

  function selectTemplate(t: GpTemplate) {
    setTemplate(t);
    setPicked({});
    const first = SENTENCES[t].find((s): s is { slot: Slot } => "slot" in s);
    setActiveSlot(first?.slot ?? null);
  }

  function fill(slot: Slot, value: { id: string; label: string }) {
    setPicked((p) => {
      const next = { ...p, [slot]: value };
      const nextEmpty = slots.find((s) => !next[s]) ?? null;
      setActiveSlot(nextEmpty);
      return next;
    });
  }

  function clearSlot(slot: Slot) {
    setPicked((p) => ({ ...p, [slot]: undefined }));
    setActiveSlot(slot);
  }

  function submit() {
    const season = picked.season ? Number(picked.season.id) : undefined;
    const [trophyName = "", trophyCountry = ""] = (picked.trophy?.id ?? "").split("||");
    let input: GpAskInput | null = null;
    switch (template) {
      case "CLUB_EVER":
        input = picked.club ? { template, clubId: picked.club.id } : null;
        break;
      case "CLUB_SEASON":
        input = picked.club && season != null ? { template, clubId: picked.club.id, season } : null;
        break;
      case "NATIONALITY":
      case "NATIONAL_TEAM":
        input = picked.country ? { template, countryName: picked.country.id } : null;
        break;
      case "COMPETITION_EVER":
        input = picked.competition ? { template, leagueId: Number(picked.competition.id) } : null;
        break;
      case "COMPETITION_SEASON":
        input =
          picked.competition && season != null
            ? { template, leagueId: Number(picked.competition.id), season }
            : null;
        break;
      case "TROPHY_EVER":
        input = picked.trophy ? { template, compName: trophyName, country: trophyCountry } : null;
        break;
      case "TROPHY_SEASON":
        input =
          picked.trophy && season != null
            ? { template, compName: trophyName, country: trophyCountry, season }
            : null;
        break;
      case "TROPHY_WITH_CLUB":
        input =
          picked.trophy && picked.club
            ? { template, compName: trophyName, country: trophyCountry, clubId: picked.club.id }
            : null;
        break;
    }
    if (input) {
      onAsk(input);
      selectTemplate(template); // reset holes, keep the frame for a follow-up
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* ── 1. investigation categories ─────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="نوع السؤال">
        {CATEGORIES.map((c) => {
          const active = c.id === categoryId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => selectCategory(c.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border px-1 py-2 transition-all disabled:opacity-50",
                active
                  ? "border-[var(--lu-gold-1)]/60 bg-[var(--lu-gold-2)]/12 shadow-[0_0_14px_rgb(var(--c-ember)/0.3)]"
                  : "border-white/10 bg-black/25 hover:border-[var(--lu-gold-1)]/30",
              )}
            >
              <span aria-hidden className={cn("text-xl leading-none", !active && "opacity-70 grayscale-[35%]")}>
                {c.icon}
              </span>
              <span
                className={cn(
                  "text-[0.6rem] font-bold leading-tight",
                  active ? "text-[var(--lu-gold-1)]" : "text-[var(--lu-tan)]",
                )}
              >
                {c.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 2. the category's question variants ─────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={categoryId}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          className="flex flex-wrap justify-center gap-1.5"
        >
          {category.variants.map((v) => (
            <button
              key={v.t}
              type="button"
              disabled={disabled}
              onClick={() => selectTemplate(v.t)}
              aria-pressed={template === v.t}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 transition disabled:opacity-50",
                // Inactive pills stay fully readable — never hover-gated.
                template === v.t
                  ? "lu-chip text-[var(--lu-gold-1)] ring-[var(--lu-gold-1)]/55"
                  : "bg-black/25 text-[var(--lu-cream)]/85 ring-white/15",
              )}
            >
              {v.label}
            </button>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* ── 3. THE SENTENCE — holes are the inputs ───────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={template}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="relative overflow-hidden rounded-2xl border border-[var(--lu-gold-1)]/25 bg-gradient-to-b from-[var(--lu-gold-2)]/[0.08] to-transparent px-3 py-3.5"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-10 h-20"
            style={{ background: "radial-gradient(60% 100% at 50% 0%, rgb(var(--c-ember)/0.16), transparent)" }}
          />
          <div className="relative flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2 text-center text-lg font-black leading-relaxed text-[var(--lu-cream)]">
            {segments.map((seg, i) =>
              "text" in seg ? (
                <span key={i}>{seg.text}</span>
              ) : picked[seg.slot] ? (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => clearSlot(seg.slot)}
                  title="اضغط للتغيير"
                  className="lu-chip inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-base font-black text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/50 transition hover:ring-[var(--lu-gold-1)]"
                >
                  {seg.slot === "season"
                    ? seasonLabel(Number(picked[seg.slot]!.id))
                    : picked[seg.slot]!.label}
                  <span aria-hidden className="text-[0.6rem] opacity-70">✕</span>
                </button>
              ) : (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => setActiveSlot(seg.slot)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-1 text-base font-bold transition",
                    currentSlot === seg.slot
                      ? "animate-pulse border-[var(--lu-ember-glow)]/80 bg-[var(--lu-ember)]/10 text-[var(--lu-ember-glow)] shadow-[0_0_12px_rgb(var(--c-ember)/0.45)]"
                      : "border-[var(--lu-gold-1)]/35 bg-black/25 text-[var(--lu-tan)]",
                  )}
                >
                  <span aria-hidden className="text-sm">{SLOT_META[seg.slot].icon}</span>
                  {SLOT_META[seg.slot].word}
                </button>
              ),
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── 4. the ACTIVE hole's input ───────────────────────────────────── */}
      {currentSlot === "season" ? (
        <select
          disabled={disabled}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) fill("season", { id: v, label: v });
          }}
          className="num w-full rounded-xl border border-[var(--border)] bg-black/50 px-4 py-3 text-base text-[var(--lu-cream)] outline-none focus:border-[var(--gold)] disabled:opacity-50"
        >
          <option value="" disabled>
            📅 اختر الموسم…
          </option>
          {SEASONS.map((y) => (
            <option key={y} value={y}>
              {seasonLabel(y)}
            </option>
          ))}
        </select>
      ) : currentSlot ? (
        <EntitySearch
          key={`${template}:${currentSlot}`}
          endpoint={SLOT_ENDPOINT[currentSlot].url}
          placeholder={SLOT_ENDPOINT[currentSlot].placeholder}
          disabled={disabled}
          onPick={(item: EntityItem) => fill(currentSlot, { id: item.id, label: item.label })}
        />
      ) : null}

      {/* ── 5. fire ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {complete ? (
          <motion.button
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            type="button"
            disabled={disabled}
            onClick={submit}
            className="btn-gold-cta w-full rounded-xl py-3 text-base font-black text-black disabled:opacity-50"
          >
            🔎 اسأل السؤال
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
