/*
 * Minimal service worker — its ONLY job is to make the app installable as a PWA
 * (Chromium fires `beforeinstallprompt` only when a service worker is present).
 * It deliberately does NO caching: every request is a network passthrough, so it
 * can never serve stale assets or interfere with auth/game state. Activates
 * immediately so updates replace any prior version cleanly.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network passthrough — present so the SW has a fetch handler, but it never
// intercepts the response (no respondWith), so the browser fetches normally.
self.addEventListener("fetch", () => {
  /* intentionally empty: let the request go to the network unchanged */
});
