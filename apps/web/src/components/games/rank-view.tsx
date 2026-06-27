import { cn } from "@/lib/utils";
import { LuHeader, LuScreen } from "./lu-screen";
import { TrophyIcon } from "./lu-icons";

/**
 * Rank leaderboard — gold-on-black redesign (docs/DESIGN_BRIEF.md §8). Pure
 * presentation: the ranked rows are computed in the page and passed in.
 */
export type RankedPlayer = {
  id: string;
  name: string;
  playerNumber: number;
  level: number;
  xp: number;
  avatarSrc: string | null;
  seed: string;
  rank: number;
  you: boolean;
};

function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function RankAvatar({
  src,
  seed,
  name,
  sizeClass,
  ring,
}: {
  src: string | null;
  seed: string;
  name: string;
  sizeClass: string;
  ring: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("rounded-full object-cover", sizeClass, ring)} />;
  }
  const hue = hueFromSeed(seed);
  return (
    <div
      aria-hidden
      className={cn("grid place-items-center rounded-full font-black text-white", sizeClass, ring)}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Podium({ p, place }: { p: RankedPlayer; place: 1 | 2 | 3 }) {
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
  const ring =
    place === 1
      ? "ring-2 ring-[var(--lu-gold-1)]/80 shadow-[0_0_22px_rgba(255,106,26,0.35)]"
      : "ring-2 ring-[var(--lu-gold-1)]/40";
  return (
    <div className={cn("flex flex-1 flex-col items-center gap-2", place === 1 ? "-mt-4" : "mt-2")}>
      <div className="relative">
        <RankAvatar
          src={p.avatarSrc}
          seed={p.seed}
          name={p.name}
          sizeClass={place === 1 ? "size-20 sm:size-24" : "size-16 sm:size-20"}
          ring={ring}
        />
        <span className="absolute -bottom-1 -end-1 text-2xl drop-shadow">{medal}</span>
      </div>
      <div className="flex max-w-full flex-col items-center">
        <span className={cn("max-w-[7rem] truncate font-bold", p.you ? "lu-gold-text" : "text-[var(--lu-cream)]")}>
          {p.you ? "أنت" : p.name}
        </span>
        <span className="num lu-chip mt-1 rounded-full px-2.5 py-0.5 text-sm font-black text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/35">
          المستوى {p.level}
        </span>
      </div>
    </div>
  );
}

function RankRow({ p }: { p: RankedPlayer }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        p.you ? "bg-[var(--lu-ember)]/10" : "odd:bg-white/[0.02]",
      )}
    >
      <span
        className={cn(
          "num grid size-8 shrink-0 place-items-center rounded-lg text-sm font-black",
          p.you ? "text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/40" : "bg-white/5 text-[var(--lu-tan)]",
        )}
      >
        {p.rank}
      </span>
      <RankAvatar
        src={p.avatarSrc}
        seed={p.seed}
        name={p.name}
        sizeClass="size-10"
        ring={cn("ring-1", p.you ? "ring-[var(--lu-gold-1)]/50" : "ring-white/12")}
      />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-bold", p.you ? "lu-gold-text" : "text-[var(--lu-cream)]")}>
          {p.you ? "أنت" : p.name}
        </div>
        <div className="num text-xs text-[var(--lu-tan)]">
          #{p.playerNumber} · {p.xp.toLocaleString("en-US")} XP
        </div>
      </div>
      <span className="num lu-chip shrink-0 rounded-full px-2.5 py-1 text-sm font-black text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/40">
        {p.level.toLocaleString("en-US")}
      </span>
    </li>
  );
}

export function RankView({
  podium,
  listed,
  pinnedMe,
  empty,
}: {
  podium: Array<{ p: RankedPlayer; place: 1 | 2 | 3 }>;
  listed: RankedPlayer[];
  pinnedMe: RankedPlayer | null;
  empty: boolean;
}) {
  return (
    <LuScreen>
      <LuHeader icon={<TrophyIcon size={22} />} title="التصنيف" subtitle="ترتيب جميع اللاعبين حسب المستوى" />

      {podium.length > 0 ? (
        <section
          className="lu-frame mb-5 mt-3 flex items-end justify-center gap-3 rounded-3xl px-3 pb-6 pt-8 sm:gap-5 sm:px-6"
          style={{ background: "radial-gradient(120% 90% at 50% 0%, rgba(255,106,26,0.12), transparent 60%), linear-gradient(180deg, rgba(30,26,19,0.92), rgba(11,10,9,0.96))" }}
        >
          {podium.map(({ p, place }) => (
            <Podium key={p.id} p={p} place={place} />
          ))}
        </section>
      ) : null}

      {listed.length > 0 ? (
        <section className="lu-frame overflow-hidden rounded-2xl">
          <ol>
            {listed.map((p) => (
              <RankRow key={p.id} p={p} />
            ))}
          </ol>
        </section>
      ) : empty ? (
        <p className="lu-frame rounded-2xl p-6 text-center text-[var(--lu-tan)]">لا يوجد لاعبون بعد.</p>
      ) : null}

      {pinnedMe ? (
        <section className="lu-frame mt-4 overflow-hidden rounded-2xl">
          <div className="px-4 pt-2 text-[0.7rem] font-bold text-[var(--lu-tan)]">ترتيبك</div>
          <ol>
            <RankRow p={pinnedMe} />
          </ol>
        </section>
      ) : null}
    </LuScreen>
  );
}
