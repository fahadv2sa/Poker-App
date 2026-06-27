import { LevelUpModal } from "@/components/level-up-modal";

/** PREVIEW ONLY — renders the (reskinned) level-up modal, auto-open. */
export const dynamic = "force-static";

export default function LevelUpPreview() {
  return (
    <main className="min-h-[100dvh] bg-[var(--lu-abyss)]">
      <LevelUpModal newLevel={12} dailyBank="12,000" />
    </main>
  );
}
