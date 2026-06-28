import type { Metadata, Viewport } from "next";
import { Inter, Tajawal } from "next/font/google";
import "./globals.css";

// Same fonts as Link Up (its standard): Tajawal for Arabic UI, Inter for Latin
// numerals — exposed as the CSS variables the tokens consume (--font-ar/--font-num).
const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-ar",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-num", display: "swap" });

export const metadata: Metadata = {
  title: "توب 10",
  description: "لعبة توب 10 — منصة فوتبول بي",
};

export const viewport: Viewport = {
  themeColor: "#07060a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${inter.variable}`}>
      <body style={{ fontFamily: "var(--font-ar), var(--font-ar-fallback)" }}>{children}</body>
    </html>
  );
}
