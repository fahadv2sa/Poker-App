import { notFound } from "next/navigation";
import { isValidThemeId, getTheme } from "@fb/theme/themes";
import { PlatformGallery, TablePreview, WinnerPreview } from "../../../_content";

/**
 * DB-free theme review: /preview/ui/<theme>/<view>. Forces the theme by wrapping the real
 * mock-state components in <div data-theme="N"> (theme tokens are scoped to [data-theme]),
 * so both themes render on the real components with no database / servers / session.
 * Dev-only (404 in production).
 */
export const dynamic = "force-static";

const VIEWS = { platform: PlatformGallery, table: TablePreview, winner: WinnerPreview } as const;
type ViewKey = keyof typeof VIEWS;

export function generateStaticParams() {
  const params: { theme: string; view: string }[] = [];
  for (const theme of ["0", "1"]) for (const view of Object.keys(VIEWS)) params.push({ theme, view });
  return params;
}

export default async function PreviewUi({ params }: { params: Promise<{ theme: string; view: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { theme, view } = await params;
  const themeId = Number(theme);
  if (!isValidThemeId(themeId) || !(view in VIEWS)) notFound();
  const Content = VIEWS[view as ViewKey];

  return (
    <div data-theme={String(themeId)} style={{ minHeight: "100vh", background: "var(--fb-bg)", color: "var(--fb-text)" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 300, background: "rgb(0 0 0 / 0.7)", color: "#fff", font: "700 12px system-ui", padding: "6px 12px", backdropFilter: "blur(6px)" }}>
        معاينة — Theme {themeId} ({getTheme(themeId).name}) · {view}
      </div>
      <Content />
    </div>
  );
}
