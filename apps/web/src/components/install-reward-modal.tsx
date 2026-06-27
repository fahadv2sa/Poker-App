"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmblemIcon, GoldGradientDefs } from "@/components/games/lu-icons";
import { cn } from "@/lib/utils";
import {
  hasInstallPrompt,
  isIOS,
  isStandalone,
  onAppInstalled,
  promptInstall,
  subscribePwa,
} from "@/lib/pwa";

const DISMISS_KEY = "fp.install.dismissed";

/**
 * "Add to home screen" reward modal. Shown only to authenticated users browsing
 * in a normal tab (NOT standalone) who haven't claimed the one-time 10,000-coin
 * reward. The reward is granted SERVER-SIDE (once per account) — this component
 * only drives the install UX and pings the server on a real install signal
 * (appinstalled, or the app already opened in standalone mode).
 */
export function InstallRewardModal({ claimed, amount }: { claimed: boolean; amount: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null); // success: new balance
  const ios = typeof window !== "undefined" && isIOS();

  async function claim(): Promise<boolean> {
    try {
      const res = await fetch("/api/install-reward/claim", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.granted) {
        setDone(String(data.balance));
        router.refresh();
        return true;
      }
    } catch {
      /* network issue — the server is still the source of truth; retry next open */
    }
    return false;
  }

  useEffect(() => {
    if (claimed) return;
    // Already installed (standalone) and not yet rewarded → grant silently now.
    // Covers iOS add-to-home and any reopened standalone session.
    if (isStandalone()) {
      void claim();
      return;
    }
    // Browser, not claimed: don't re-nag if dismissed this session.
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1") return;

    setCanPrompt(hasInstallPrompt());
    const unsub = subscribePwa(() => setCanPrompt(hasInstallPrompt()));
    // A real install (Chromium) → claim the reward and show success.
    const offInstalled = onAppInstalled(() => void claim());
    // Appear after the home screen has settled (not jarring).
    const t = setTimeout(() => setOpen(true), 1200);
    return () => {
      clearTimeout(t);
      unsub();
      offInstalled();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimed]);

  if (claimed || !open) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  const onInstall = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    // On "accepted" the appinstalled handler claims the reward; "dismissed"
    // leaves the modal so they can try again. "unavailable" → fall through to
    // the manual hint shown below.
    if (outcome === "dismissed") dismiss();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="أضف اللعبة إلى شاشتك الرئيسية"
      onClick={dismiss}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn("lu-frame fade-rise relative w-full max-w-sm overflow-hidden rounded-3xl p-6 text-center")}
      >
        <GoldGradientDefs />
        <button
          type="button"
          aria-label="إغلاق"
          onClick={dismiss}
          className="absolute end-3 top-3 grid size-8 place-items-center rounded-full bg-white/5 text-lg text-[var(--lu-tan)] transition hover:bg-white/10 hover:text-[var(--lu-cream)]"
        >
          ✕
        </button>

        {/* glowing app mark */}
        <div className="mx-auto mb-3 grid size-20 place-items-center rounded-3xl border border-[var(--lu-gold-1)]/30 bg-[var(--lu-gold-2)]/10 [box-shadow:0_0_28px_rgba(255,106,26,0.28)]">
          <EmblemIcon size={44} />
        </div>

        {done ? (
          <>
            <h2 className="lu-gold-text lu-gold-title text-xl font-black">تمت إضافة المكافأة! 🎉</h2>
            <p className="mt-1 text-sm text-[var(--lu-tan)]">
              أُضيفت <span className="num font-bold text-[var(--lu-gold-1)]">{amount}</span> كوين — رصيدك الآن{" "}
              <span className="num font-bold text-[var(--lu-cream)]">{done}</span>.
            </p>
            <Button onClick={() => setOpen(false)} size="lg" className="btn-gold-cta mt-5 w-full text-black">
              رائع
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-black leading-tight text-[var(--lu-cream)]">أضِف اللعبة إلى شاشتك</h2>
            <p className="mt-1 text-sm text-[var(--lu-tan)]">مكافأة لمرة واحدة عند التثبيت</p>

            {/* the reward — the hero number */}
            <div className="my-5 flex items-center justify-center gap-2">
              <span aria-hidden className="text-3xl">🪙</span>
              <span className="num lu-gold-text lu-gold-title text-4xl font-black">{amount}</span>
              <span className="self-end pb-1 text-sm font-bold text-[var(--lu-gold-1)]/80">كوين</span>
            </div>

            {ios ? (
              // iOS: no install prompt — a clear numbered step list (one per line).
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-[var(--lu-cream)]">
                <ol className="flex flex-col gap-2 text-start">
                  {[
                    "اضغط زر المشاركة من متصفح سفاري",
                    "إضافة إلى الشاشة الرئيسية / الهوم سكرين",
                    "افتح التطبيق من الأيقونة التي ستظهر مع التطبيقات",
                    "ستحصل تلقائيًا على 10 آلاف كوين كهدية",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2 leading-relaxed">
                      <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-[var(--lu-gold-1)]/15 text-[0.7rem] font-bold text-[var(--lu-gold-1)]">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : canPrompt ? (
              <Button onClick={onInstall} disabled={busy} size="lg" className="btn-gold-cta w-full text-black">
                {busy ? "جارٍ التثبيت…" : "🚀 ثبّت التطبيق واحصل على المكافأة"}
              </Button>
            ) : (
              // Chromium without a live prompt (or unsupported): manual hint.
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-[var(--lu-cream)]">
                <p className="leading-relaxed">
                  افتح قائمة المتصفّح ثم{" "}
                  <span className="font-bold text-[var(--lu-gold-1)]">«تثبيت التطبيق / إضافة إلى الشاشة الرئيسية»</span>
                </p>
                <p className="mt-1 text-xs text-[var(--lu-tan)]">
                  ستصلك المكافأة تلقائيًا بعد التثبيت.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={dismiss}
              className="mt-4 text-xs text-[var(--lu-tan)] transition hover:text-[var(--lu-cream)]"
            >
              ربما لاحقًا
            </button>
          </>
        )}
      </div>
    </div>
  );
}
