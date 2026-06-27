import { RankView, type RankedPlayer } from "@/components/games/rank-view";

/** PREVIEW ONLY — no auth/DB; mock leaderboard to judge the rank redesign. */
export const dynamic = "force-static";

const mk = (rank: number, name: string, level: number, xp: number, you = false): RankedPlayer => ({
  id: String(rank),
  name,
  playerNumber: 1000 + rank,
  level,
  xp,
  avatarSrc: null,
  seed: name,
  rank,
  you,
});

export default function RankPreview() {
  const all = [
    mk(1, "سلطان", 24, 48200),
    mk(2, "فهد", 22, 41100, true),
    mk(3, "ناصر", 21, 39000),
    mk(4, "عبدالله", 19, 33400),
    mk(5, "تركي", 18, 31200),
    mk(6, "ريان", 16, 27800),
    mk(7, "خالد", 15, 24100),
  ];
  const podium: Array<{ p: RankedPlayer; place: 1 | 2 | 3 }> = [
    { p: all[1]!, place: 2 },
    { p: all[0]!, place: 1 },
    { p: all[2]!, place: 3 },
  ];
  return <RankView podium={podium} listed={all.slice(3)} pinnedMe={null} empty={false} />;
}
