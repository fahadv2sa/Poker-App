import { LinkUpHome } from "@/components/games/link-up-home";

/**
 * PREVIEW ONLY — standalone visual harness for the redesigned Link Up home.
 * No auth, no DB: renders the presentational component with mock data so the
 * design can be judged locally without a session. Not linked from anywhere and
 * carries no real data; safe to delete once the redesign is approved.
 */
export const dynamic = "force-static";

export default function LinkUpHomePreview() {
  return <LinkUpHome rank="#128" totalPlayers="4.2K" />;
}
