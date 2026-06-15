import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Tajawal } from "next/font/google";
import "./globals.css";

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
  title: "فوتبول بوكر",
  description: "لعبة ورق كرة قدم بأسلوب بوكر — أونلاين",
};

export const viewport: Viewport = {
  themeColor: "#080b13",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
