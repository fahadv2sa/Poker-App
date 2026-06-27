import { InstallRewardModal } from "@/components/install-reward-modal";

/**
 * PREVIEW ONLY — renders the (reskinned) install-reward modal. It opens ~1.2s
 * after load (browser, not standalone, not yet dismissed this session). If it
 * doesn't appear, it was dismissed this session — open in a fresh tab.
 */
export const dynamic = "force-static";

export default function InstallPreview() {
  return (
    <main className="min-h-[100dvh] bg-[var(--lu-abyss)]">
      <InstallRewardModal claimed={false} amount="10,000" />
    </main>
  );
}
