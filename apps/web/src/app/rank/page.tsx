import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { BOT_PLAYER_NUMBER_BASE } from "@fp/shared";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Deterministic gradient hue for the generated avatar fallback (matches the
 *  rest of the app — no shared export, so a tiny local copy). */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

interface RankedPlayer {
  id: string;
  name: string;
  playerNumber: number;
  level: number;
  xp: number;
  avatarSrc: string | null;
  seed: string;
  rank: number;
  you: boolean;
}

const MAX_ROWS = 100;

/** Avatar — uploaded image or a deterministic gradient fallback. */
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

/** A single podium plinth (top 3). `place` 1 is elevated + gold. */
function Podium({ p, place }: { p: RankedPlayer; place: 1 | 2 | 3 }) {
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
  const tone = place === 1 ? "var(--gold)" : place === 2 ? "var(--accent)" : "var(--primary)";
  const ring =
    place === 1
      ? "ring-2 ring-gold/70 [box-shadow:0_0_22px_color-mix(in_oklch,var(--gold)_35%,transparent)]"
      : place === 2
        ? "ring-2 ring-accent/60"
        : "ring-2 ring-primary/60";
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
        <span className={cn("max-w-[7rem] truncate font-bold", p.you && "text-primary")}>
          {p.you ? "أنت" : p.name}
        </span>
        <span
          className="num mt-1 rounded-full px-2.5 py-0.5 text-sm font-black"
          style={{
            color: tone,
            background: `color-mix(in oklch, ${tone} 14%, transparent)`,
            border: `1px solid color-mix(in oklch, ${tone} 40%, transparent)`,
          }}
        >
          المستوى {p.level}
        </span>
      </div>
    </div>
  );
}

/** A ranked list row (places 4+ and the pinned self row). */
function RankRow({ p }: { p: RankedPlayer }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        p.you ? "bg-primary/10" : "odd:bg-white/[0.02]",
      )}
    >
      <span
        className={cn(
          "num grid size-8 shrink-0 place-items-center rounded-lg text-sm font-black",
          p.you ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground",
        )}
      >
        {p.rank}
      </span>
      <RankAvatar
        src={p.avatarSrc}
        seed={p.seed}
        name={p.name}
        sizeClass="size-10"
        ring={cn("ring-1", p.you ? "ring-primary/50" : "ring-white/12")}
      />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-bold", p.you && "text-primary")}>
          {p.you ? "أنت" : p.name}
        </div>
        <div className="num text-xs text-muted-foreground">
          #{p.playerNumber} · {p.xp.toLocaleString("en-US")} XP
        </div>
      </div>
      <span className="num shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-sm font-black text-gold">
        {p.level.toLocaleString("en-US")}
      </span>
    </li>
  );
}

export default async function RankPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // ALL human players (bots excluded) + their level/xp from the existing metrics
  // read model. Sorted by level (XP tiebreak) — the same ordering as the home
  // rank badge. Current scale is small; cap the rendered list and pin self below.
  const users = await prisma.user.findMany({
    where: { playerNumber: { lt: BOT_PLAYER_NUMBER_BASE } },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatarSeed: true,
      playerNumber: true,
      metrics: { select: { level: true, xp: true } },
      avatar: { select: { updatedAt: true } },
    },
  });

  const ranked: RankedPlayer[] = users
    .map((u) => ({
      id: u.id,
      name: u.nickname ?? u.username,
      playerNumber: u.playerNumber,
      level: u.metrics?.level ?? 1,
      xp: u.metrics ? Number(u.metrics.xp) : 0,
      avatarSrc: u.avatar ? `/api/profile/avatar/${u.id}?v=${u.avatar.updatedAt.getTime()}` : null,
      seed: u.avatarSeed ?? u.username,
    }))
    .sort((a, b) => b.level - a.level || b.xp - a.xp || a.playerNumber - b.playerNumber)
    .map((r, i) => ({ ...r, rank: i + 1, you: r.id === userId }));

  const top3 = ranked.slice(0, 3);
  const listed = ranked.slice(3, MAX_ROWS);
  const me = ranked.find((r) => r.you);
  const meBeyond = me && me.rank > MAX_ROWS;

  // Podium display order: 2nd · 1st · 3rd.
  const podiumOrder: Array<{ p: RankedPlayer; place: 1 | 2 | 3 }> = [];
  if (top3[1]) podiumOrder.push({ p: top3[1], place: 2 });
  if (top3[0]) podiumOrder.push({ p: top3[0], place: 1 });
  if (top3[2]) podiumOrder.push({ p: top3[2], place: 3 });

  return (
    <main className="relative mx-auto max-w-2xl px-4 pb-10 sm:px-6 page-top">
      <div aria-hidden className="arena-rail" />

      <PageHeader
        icon="🏆"
        title="الرانك العام"
        subtitle="ترتيب جميع اللاعبين حسب المستوى"
        accent="gold"
      />

      {/* Podium — top 3 */}
      {podiumOrder.length > 0 ? (
        <section
          className="panel panel-accent relative z-10 mb-5 flex items-end justify-center gap-3 px-3 pb-6 pt-8 sm:gap-5 sm:px-6"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 0%, color-mix(in oklch, var(--gold) 12%, transparent), transparent 60%), linear-gradient(180deg, color-mix(in oklch, var(--card) 88%, white 5%), color-mix(in oklch, var(--background) 72%, var(--card)))",
          }}
        >
          {podiumOrder.map(({ p, place }) => (
            <Podium key={p.id} p={p} place={place} />
          ))}
        </section>
      ) : null}

      {/* Ranked list — places 4+ */}
      {listed.length > 0 ? (
        <section className="panel relative z-10 overflow-hidden">
          <ol>
            {listed.map((p) => (
              <RankRow key={p.id} p={p} />
            ))}
          </ol>
        </section>
      ) : top3.length === 0 ? (
        <p className="relative z-10 rounded-2xl border border-white/10 bg-card/60 p-6 text-center text-muted-foreground">
          لا يوجد لاعبون بعد.
        </p>
      ) : null}

      {/* Your own position, pinned, if you're beyond the listed rows */}
      {meBeyond && me ? (
        <section className="panel relative z-10 mt-4 overflow-hidden border-primary/30">
          <div className="px-4 pt-2 text-[0.7rem] font-bold text-muted-foreground">ترتيبك</div>
          <ol>
            <RankRow p={me} />
          </ol>
        </section>
      ) : null}
    </main>
  );
}
