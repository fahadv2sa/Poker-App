import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Tajawal } from "next/font/google";
import "./globals.css";
import { InteractionSound } from "@/components/interaction-sound";
import { SwRegister } from "@/components/sw-register";

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
  },
  twitter: {
    card: "summary",
    title: "فوتبول بي",
    description: "تحديات كرة قدم",
  },
};

export const viewport: Viewport = {
  themeColor: "#080b13",
  width: "device-width",
  initialScale: 1,
  // Let the table use the full screen and expose env(safe-area-inset-*) so the
  // pinned header/action bar can avoid the notch / home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${inter.variable}`}>
      <body>
        <SwRegister />
        <InteractionSound />
        {children}
      </body>
    </html>
  );
}
