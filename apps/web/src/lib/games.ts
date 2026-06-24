/**
 * Platform games registry (Football B). The hub at `/` renders one card per entry;
 * adding a new game = append an entry here + create its route under `/games/<id>`.
 * Only "live" games are navigable; "soon" games render as disabled placeholders.
 *
 * NOTE: economy/stats are PER-GAME (no platform-wide coins/level) — the hub stays
 * identity-only; each game owns its own UI/economy behind its `href`.
 */
export type GameStatus = "live" | "soon";

export type GameEntry = {
  /** Stable id (also the intended route segment under `/games`). */
  id: string;
  /** Arabic display name shown on the hub card. */
  nameAr: string;
  /** Target route for a live game; `null` while "soon". */
  href: string | null;
  status: GameStatus;
  /** Emoji icon (placeholder art until real artwork is added). */
  icon: string;
};

export const GAMES: GameEntry[] = [
  { id: "link-up", nameAr: "لينك اب", href: "/games/link-up", status: "live", icon: "🔗" },
  { id: "top-10", nameAr: "توب 10", href: null, status: "soon", icon: "🔟" },
  { id: "guess-player", nameAr: "خمن اللاعب", href: null, status: "soon", icon: "❓" },
  { id: "game-4", nameAr: "قريباً", href: null, status: "soon", icon: "⚽" },
];
