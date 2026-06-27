import Link from "next/link";
import { BackIcon, CrownIcon, GoldGradientDefs } from "@/components/games/lu-icons";
import { LuAtmosphere } from "@/components/games/lu-screen";

export const metadata = { title: "الاشتراك — فوتبول بي" };

/**
 * /subscribe — the gold-on-black "gotcha" page reached from the hub Subscribe
 * card. A single large centered card delivers the punchline (no real
 * subscription exists). Visual only; no data, no auth dependency.
 */
export default function SubscribePage() {
  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-[30rem] flex-col overflow-hidden bg-[var(--lu-abyss)] px-5 pb-10 page-top">
      <GoldGradientDefs />
      <LuAtmosphere />

      <div className="relative z-10 flex flex-1 flex-col">
        {/* back to hub */}
        <header className="flex items-center pt-1">
          <Link
            href="/"
            aria-label="رجوع"
            className="lu-btn lu-frame grid size-10 shrink-0 place-items-center rounded-xl"
          >
            <BackIcon size={20} />
          </Link>
        </header>

        {/* large centered card */}
        <div className="flex flex-1 items-center justify-center py-6">
          <section className="lu-frame lu-sub-rim relative w-full overflow-hidden rounded-[2rem] px-7 py-12 text-center">
            <span aria-hidden className="lu-sub-sheen" />

            {/* crown medallion with breathing ember halo */}
            <span className="relative mx-auto mb-8 grid w-fit place-items-center">
              <span
                aria-hidden
                className="lu-anim-pulse absolute size-24 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(255,106,26,0.4), transparent 66%)" }}
              />
              <span className="lu-chip relative grid size-20 place-items-center rounded-3xl ring-1 ring-[var(--lu-gold-1)]/40 shadow-[0_10px_30px_rgba(255,106,26,0.3)]">
                <CrownIcon size={40} />
              </span>
            </span>

            {/* the punchline — each line on its own line */}
            <p className="lu-gold-text lu-gold-title text-3xl font-black leading-snug">
              صدّقت؟؟ 😂
            </p>
            <p className="mt-5 text-2xl font-extrabold leading-snug text-[var(--lu-cream)]">
              العب ببلاش
            </p>
            <p className="mt-3 text-lg font-medium leading-snug text-[var(--lu-tan)]">
              ما في أي اشتراك يا حلو
            </p>

            <span className="lu-divider mx-auto mt-9 block w-2/3" />

            <Link
              href="/"
              data-sound="quick-play"
              className="lu-btn lu-frame mt-7 inline-flex items-center justify-center rounded-2xl px-7 py-3 text-base font-bold text-[var(--lu-cream)] transition active:scale-95"
            >
              يلا نلعب
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
