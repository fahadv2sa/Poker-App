"use client";

import { useEffect } from "react";
// Importing the PWA module here ensures its beforeinstallprompt/appinstalled
// listeners are wired as early as possible (this component is in the root layout).
import "@/lib/pwa";

/**
 * Registers the minimal service worker so the app is installable (PWA). The SW
 * does no caching, so this is safe — it only unlocks the install prompt. Renders
 * nothing.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failure is non-fatal — the app works without install */
      });
    }
  }, []);
  return null;
}
