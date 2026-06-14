import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

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
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
