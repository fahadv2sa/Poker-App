"use client";

import { Countdown, FlyProvider, SeatAvatar, CONFETTI } from "@fb/table-ui";

/**
 * PREVIEW ONLY — Phase-0 scaffold for the Top Ten live table. It validates the shared
 * pipeline end-to-end: the felt + pitch-line surface (`.lu-felt` from @fb/table-ui,
 * assets in /public), the extracted primitives (SeatAvatar, Countdown), confetti, and
 * the FlyProvider mount. Mock data, no auth, no socket. P1 replaces this body with the
 * real playable skeleton (10-card grid, opponent arc, search dock, your HUD).
 * NOT linked anywhere; throwaway visual harness.
 */
export default function PreviewTable() {
  const deadline = Date.now() + 22_000;
  return (
    <FlyProvider>
      <main
        className="mx-auto flex h-[100dvh] max-w-md flex-col gap-3 overflow-hidden bg-[var(--lu-abyss)] px-3 py-3"
        style={{ paddingTop: "max(0.6rem, env(safe-area-inset-top))", paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="text-center text-xs tracking-[0.2em] text-[var(--lu-tan)]">
          PREVIEW · Phase 0 — shared table pipeline
        </div>

        {/* opponent arc placeholder (shared SeatAvatar + Countdown) */}
        <div className="-mb-4 flex justify-center gap-3">
          {[
            { n: 9001, s: "لاعب ١" },
            { n: 9002, s: "لاعب ٢" },
            { n: 9003, s: "لاعب ٣" },
          ].map((p) => (
            <div key={p.n} className="flex flex-col items-center gap-1">
              <SeatAvatar playerNumber={p.n} seed={p.s} sizeClass="size-10" className="ring-1 ring-[var(--lu-gold-1)]/30" />
              <span className="text-[0.6rem] text-[var(--lu-cream)]/80">{p.s}</span>
            </div>
          ))}
        </div>

        {/* the felt: stone surface + gold pitch lines + breathing ball glow */}
        <section
          className="lu-felt relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-[32px] border border-[var(--lu-gold-1)]/20 px-4 py-6"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full opacity-80"
          >
            <img src="/table-ball.png" alt="" className="size-full object-cover" />
          </span>
          <div className="relative z-10 text-center">
            <div className="lu-gold-text lu-gold-title text-lg font-black">أكثر اللاعبين تسجيلاً للأهداف</div>
            <div className="text-xs text-[var(--lu-tan)]">برشلونة في الدوري الإسباني · 2020</div>
          </div>
          <div className="relative z-10">
            <Countdown deadlineTs={deadline} totalMs={30_000} />
          </div>
          <p className="relative z-10 text-center text-xs text-[var(--lu-cream)]/60">
            (felt + pitch lines + shared timer render → pipeline OK. P1 builds the 10-card grid here.)
          </p>
        </section>

        {/* confetti sanity (decorative; hidden under reduced-motion via table.css) */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
          {CONFETTI.slice(0, 8).map((c, i) => (
            <span
              key={i}
              className="confetti-pc"
              style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s` }}
            />
          ))}
        </div>
      </main>
    </FlyProvider>
  );
}
