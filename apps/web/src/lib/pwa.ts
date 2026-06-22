"use client";

/**
 * PWA install helpers. The `beforeinstallprompt` event can fire once, early, on
 * Chromium — so we capture & defer it at module load (this module is imported by
 * the always-mounted SwRegister), and expose it to the install modal. Also wires
 * `appinstalled` and standalone/iOS detection. No coins logic here — the reward
 * is granted server-side; this only drives the install UX.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it deferred so we can trigger it from the modal
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

/** True when the app is running as an installed/standalone app (incl. iOS). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iOS/iPadOS Safari has no beforeinstallprompt — we show manual instructions
 *  instead. (iPadOS 13+ can report as Mac, but the standalone-open path grants
 *  the reward regardless of this hint, so a missed detection isn't harmful.) */
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iDevice = /iphone|ipad|ipod/i.test(ua);
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iDevice || iPadOS;
}

export function hasInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

/** Subscribe to prompt-availability changes (returns an unsubscribe). */
export function subscribePwa(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Trigger the native install prompt; resolves with the user's choice. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const evt = deferredPrompt;
  if (!evt) return "unavailable";
  await evt.prompt();
  const choice = await evt.userChoice;
  deferredPrompt = null;
  emit();
  return choice.outcome;
}

/** Run `fn` when the app is actually installed (Chromium). Returns an unsub. */
export function onAppInstalled(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("appinstalled", fn);
  return () => window.removeEventListener("appinstalled", fn);
}
