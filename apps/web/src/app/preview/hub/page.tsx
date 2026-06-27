import { PlatformHub } from "@/components/games/platform-hub";
import { GAMES } from "@/lib/games";

/**
 * PREVIEW ONLY — standalone visual harness for the redesigned platform hub.
 * No auth/DB: mock identity + the real games registry so the design can be
 * judged locally. Not linked anywhere; safe to delete once approved.
 */
export const dynamic = "force-static";

export default function HubPreview() {
  return (
    <PlatformHub
      displayName="فهد"
      avatarUrl={null}
      hue={28}
      initial="ف"
      likes="1,284"
      friends="34"
      games={GAMES}
    />
  );
}
