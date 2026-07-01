import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Inter, Tajawal } from "next/font/google";
import "./globals.css";
import {
  chromeFor,
  DEFAULT_THEME_ID,
  resolveThemeId,
  THEME_COOKIE,
  THEME_SWITCHING_ENABLED,
} from "@fb/theme/themes";
import { InteractionSound } from "@/components/interaction-sound";
import { SwRegister } from "@/components/sw-register";

/**
 * The active theme number for this request. While switching is DORMANT
 * (THEME_SWITCHING_ENABLED = false) we never read the cookie → the app stays on the
 * default theme AND avoids opting every route into dynamic rendering. Flip the flag and
 * this transparently becomes cookie-driven (dashboard/user switching) with no rework.
 */
async function activeThemeId(): Promise<number> {
  if (!THEME_SWITCHING_ENABLED) return DEFAULT_THEME_ID;
  const store = await cookies();
  return resolveThemeId(store.get(THEME_COOKIE)?.value);
}

// Fonts delivered via next/font (audit #6): Tajawal for Arabic UI, Inter for
// Latin numerals. Exposed as CSS variables consumed by globals.css.
const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-ar",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-num",
  display: "swap",
});

export const metadata: Metadata = {
  // Canonical origin — REQUIRED so og:image / twitter:image resolve to an
  // ABSOLUTE https URL (social crawlers reject relative/localhost image URLs;
  // this was the missing piece that made share previews silently not render).
  metadataBase: new URL("https://game1.fmgtech.dev"),
  title: "فوتبول بي",
  description: "تحديات كرة قدم",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "فوتبول بي",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "فوتبول بي",
    description: "تحديات كرة قدم",
    type: "website",
    locale: "ar_AR",
    siteName: "فوتبول بي",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "فوتبول بي" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "فوتبول بي",
    description: "تحديات كرة قدم",
    images: ["/og.png"],
  },
};

// PWA/browser chrome colour follows the ACTIVE theme (one source: the registry). Static
// while switching is dormant; per-request once the master switch is on.
export async function generateViewport(): Promise<Viewport> {
  return {
    themeColor: chromeFor(await activeThemeId()),
    width: "device-width",
    initialScale: 1,
    // Let the table use the full screen and expose env(safe-area-inset-*) so the
    // pinned header/action bar can avoid the notch / home indicator.
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const themeId = await activeThemeId();
  return (
    <html lang="ar" dir="rtl" data-theme={String(themeId)} className={`${tajawal.variable} ${inter.variable}`}>
      <body>
        <SwRegister />
        <InteractionSound />
        {children}
      </body>
    </html>
  );
}
