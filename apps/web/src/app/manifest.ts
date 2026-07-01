import type { MetadataRoute } from "next";
import { chromeFor, DEFAULT_THEME_ID } from "@fb/theme/themes";

// Web app manifest → enables a polished add-to-home-screen install on Android
// (Chrome reads name/icons/colors from here). iOS uses the apple-touch-icon +
// apple meta tags wired in layout.tsx instead. Background/theme match the brand.
export default function manifest(): MetadataRoute.Manifest {
  // `scope` is set explicitly (everything is under "/") so EVERY in-app URL — including
  // table/invite links like /games/top-10/play and /table/[id] — is in the PWA's scope.
  // `handle_links` + `launch_handler` ask the OS to open in-scope links in the INSTALLED
  // app (reusing its existing window) instead of a fresh browser tab. These are valid
  // manifest members not yet in Next's typed Manifest, so we attach them via a cast.
  const m = {
    name: "فوتبول بي — Football B",
    short_name: "فوتبول بي",
    description: "تحديات كرة قدم",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: chromeFor(DEFAULT_THEME_ID),
    theme_color: chromeFor(DEFAULT_THEME_ID),
    lang: "ar",
    dir: "rtl",
    orientation: "portrait",
    handle_links: "preferred",
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return m as unknown as MetadataRoute.Manifest;
}
