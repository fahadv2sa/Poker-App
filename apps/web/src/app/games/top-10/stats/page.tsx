import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { levelForXp, levelProgress } from "@fb/top-10-engine";
import { StatsIcon } from "@fb/top-10-ui";
import { auth } from "@/auth";
import { LuHeader, LuPanel, LuScreen } from "@/components/top-10/lu-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإحصائيات — توب 10" };

const DIFF_AR: Record<string, string> = { EASY: "سهل", MEDIUM: "متوسط", HARD: "صعب" };

type Tile = { icon: string; label: string; value: string; tone: "cream" | "gold" | "lose" };
const TONE: Record<Tile["tone"], string> = {
  cream: "var(--lu-cream)",
  gold: "var(--lu-gold-1)",
  lose: "#d9694f",
};

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [prog, recent] = await Promise.all([
    prisma.ttProgression.findUnique({ where: { userId } }),
    prisma.ttMatchPlayer.findMany({
      where: { userId },
      orderBy: { joinedAt: "desc" },
      take: 10,
      include: { match: { select: { difficulty: true } } },
    }),
  ]);

  const xp = Number(prog?.xp ?? 0n);
  const level = prog?.level ?? levelForXp(xp);
  const played = prog?.matchesPlayed ?? 0;
  const won = prog?.matchesWon ?? 0;
  const winRate = played > 0 ? Math.round((won / played) * 100) : 0;
  const prg = levelProgress(xp);
  const pct = prg.levelSpan > 0 ? Math.min(100, Math.round((prg.intoLevel / prg.levelSpan) * 100)) : 0;

  const core: Tile[] = [
    { icon: "⚽", label: "المباريات", value: String(played), tone: "cream" },
    { icon: "🏆", label: "الانتصارات", value: String(won), tone: "gold" },
    { icon: "🎯", label: "نسبة الفوز", value: `${winRate}%`, tone: "gold" },
  ];

  return (
    <LuScreen>
      <LuHeader icon={<StatsIcon size={22} />} title="الإحصائيات" subtitle="مستواك وأداؤك" />

      {/* level hero */}
      <LuPanel className="mt-3 flex flex-col items-center gap-3 text-center">
        <span className="lu-orb grid size-24 place-items-center rounded-full">
          <span className="num text-3xl font-black text-[#2a1f02]">{level}</span>
        </span>
        <p className="lu-gold-text lu-gold-title text-lg font-black">المستوى {level}</p>
        <div className="w-full">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/40">
            <div className="bar-fill h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#f7e6b0,#c9962e)" }} />
          </div>
          <p className="mt-1.5 text-xs text-[var(--lu-tan)]">
            <span className="num">{prg.intoLevel.toLocaleString("en-US")}</span> /{" "}
            <span className="num">{prg.levelSpan.toLocaleString("en-US")}</span> خبرة للمستوى التالي
          </p>
        </div>
      </LuPanel>

      {/* core tiles */}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {core.map((t) => (
          <div key={t.label} className="lu-frame flex flex-col items-center gap-1 rounded-2xl py-4">
            <span aria-hidden className="text-xl">{t.icon}</span>
            <span className="num text-2xl font-black" style={{ color: TONE[t.tone] }}>{t.value}</span>
            <span className="text-xs text-[var(--lu-tan)]">{t.label}</span>
          </div>
        ))}
      </div>

      {/* recent matches */}
      <h2 className="mb-2 mt-5 px-1 text-sm font-bold text-[var(--lu-cream)]">آخر المباريات</h2>
      {recent.length === 0 ? (
        <LuPanel className="text-center text-sm text-[var(--lu-tan)]">لا توجد مباريات بعد — ابدأ أول مباراة!</LuPanel>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((m) => (
            <li key={m.id} className="lu-frame flex items-center justify-between rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="lu-chip rounded-lg px-2.5 py-1 text-xs font-bold lu-gold-text">{DIFF_AR[m.match.difficulty] ?? m.match.difficulty}</span>
                <span className="text-sm text-[var(--lu-cream)]">{m.status === "WITHDRAWN" ? "منسحب" : "مكتملة"}</span>
              </div>
              <span className="num text-lg font-bold text-[var(--lu-gold-1)]">{m.totalPoints}</span>
            </li>
          ))}
        </ul>
      )}
    </LuScreen>
  );
}
