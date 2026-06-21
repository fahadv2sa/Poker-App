import type { MetadataRoute } from "next";

// Web app manifest → enables a polished add-to-home-screen install on Android
// (Chrome reads name/icons/colors from here). iOS uses the apple-touch-icon +
// apple meta tags wired in layout.tsx instead. Background/theme match the brand.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "فوتبول بي — Football Poker",
    short_name: "فوتبول بي",
    description: "تحديات كرة قدم",
    start_url: "/",
    display: "standalone",
    background_color: "#080b13",
    theme_color: "#080b13",
    lang: "ar",
    dir: "rtl",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
