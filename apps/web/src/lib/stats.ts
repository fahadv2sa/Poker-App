/**
 * Pure derivation of display statistics + achievements (Section 14). Stats
 * themselves are maintained server-authoritatively by the game server inside the
 * results transaction; this only shapes them for display and derives simple,
 * data-driven achievements from the stat values (no separate achievements table).
 */

export interface RawStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  folds: number;
  totalCoinsWon: bigint;
  totalCoinsLost: bigint;
  netProfitLoss: bigint;
  highestBalance: bigint;
}

export interface Achievement {
  id: string;
  title: string;
  hint: string;
  unlocked: boolean;
}

export interface DerivedStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  folds: number;
  /** Win rate as an integer percentage (0–100). */
  winRate: number;
  totalCoinsWon: string;
  totalCoinsLost: string;
  netProfitLoss: string;
  achievements: Achievement[];
}

export function deriveAchievements(s: RawStats): Achievement[] {
  const defs: Array<Omit<Achievement, "unlocked"> & { when: boolean }> = [
    { id: "first_game", title: "أول مباراة", hint: "العب أول مباراة", when: s.gamesPlayed >= 1 },
    { id: "first_win", title: "أول انتصار", hint: "اربح مباراة واحدة", when: s.wins >= 1 },
    { id: "veteran", title: "مخضرم", hint: "العب 10 مباريات", when: s.gamesPlayed >= 10 },
    { id: "sharpshooter", title: "قنّاص", hint: "اربح 10 مباريات", when: s.wins >= 10 },
    { id: "in_profit", title: "رابح", hint: "حقّق صافي ربح موجب", when: s.netProfitLoss > 0n },
    { id: "high_roller", title: "ثري", hint: "ابلغ ثروة 5000 كوين", when: s.highestBalance >= 5000n },
  ];
  return defs.map(({ when, ...rest }) => ({ ...rest, unlocked: when }));
}

export function deriveStats(s: RawStats): DerivedStats {
  const winRate = s.gamesPlayed > 0 ? Math.round((s.wins / s.gamesPlayed) * 100) : 0;
  return {
    gamesPlayed: s.gamesPlayed,
    wins: s.wins,
    losses: s.losses,
    folds: s.folds,
    winRate,
    totalCoinsWon: s.totalCoinsWon.toString(),
    totalCoinsLost: s.totalCoinsLost.toString(),
    netProfitLoss: s.netProfitLoss.toString(),
    achievements: deriveAchievements(s),
  };
}
