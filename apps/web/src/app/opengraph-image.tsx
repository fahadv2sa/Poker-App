import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Dynamic Open Graph / Twitter share image (WhatsApp, Telegram, X, …).
 * Next.js auto-wires this file into <meta property="og:image"> and
 * <meta name="twitter:image">. Rendered once at build, then cached.
 *
 * Theme matches globals.css: deep navy-black surface, neon-mint primary,
 * gold Coins accent, top-down football-pitch motif inside a playing card.
 * Colors are hex/rgba (Satori does not understand the app's oklch tokens),
 * and Arabic is rendered with the bundled Tajawal font (Satori has no
 * Arabic glyphs by default).
 */

export const alt = "فوتبول بي — تحديات كرة قدم";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generate on demand (and cache) rather than at build: social crawlers fetch
// this rarely, and it keeps the production build from depending on prerendering
// a Satori/wasm route.
export const dynamic = "force-dynamic";

// Read from disk (no network, no webpack asset URL): process.cwd() is the
// apps/web package root at both build and runtime, where this source lives.
const fontData = readFileSync(
  join(process.cwd(), "src", "app", "Tajawal-Bold.ttf"),
);

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 72,
          padding: 80,
          backgroundColor: "#080b13",
          color: "#eef2f9",
          fontFamily: "Tajawal",
          backgroundImage:
            "radial-gradient(900px 520px at 50% -12%, rgba(84,182,232,0.16), transparent 60%), radial-gradient(760px 520px at 100% 0%, rgba(62,227,168,0.14), transparent 55%)",
        }}
      >
        {/* Text block */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 26,
            maxWidth: 680,
          }}
        >
          {/* Satori has no reliable RTL inter-word space metrics, so each word
              is its own box with a controlled gap, ordered left→right so the
              line reads "فوتبول بي" right→left. Dot is last = rightmost (RTL lead). */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 22,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "baseline",
                gap: 26,
                fontSize: 100,
                fontWeight: 700,
                lineHeight: 1,
                color: "#f4f8ff",
              }}
            >
              <div>بي</div>
              <div>فوتبول</div>
            </div>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: "#3ee3a8",
                boxShadow: "0 0 28px rgba(62,227,168,0.85)",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 16,
              fontSize: 46,
              fontWeight: 700,
              color: "#e9c55c",
            }}
          >
            <div>قدم</div>
            <div>كرة</div>
            <div>تحديات</div>
          </div>
          <div
            style={{
              width: 200,
              height: 6,
              borderRadius: 3,
              backgroundImage:
                "linear-gradient(90deg, #3ee3a8 0%, rgba(62,227,168,0) 100%)",
            }}
          />
        </div>

        {/* Football card */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 320,
            height: 446,
            borderRadius: 28,
            border: "3px solid rgba(233,197,92,0.85)",
            backgroundImage: "linear-gradient(160deg, #1b2233 0%, #0c111d 100%)",
            boxShadow: "0 34px 72px rgba(0,0,0,0.6)",
            transform: "rotate(-6deg)",
          }}
        >
          {/* corner pips */}
          <div
            style={{
              position: "absolute",
              top: 18,
              left: 18,
              width: 16,
              height: 22,
              borderRadius: 4,
              backgroundColor: "rgba(233,197,92,0.9)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 18,
              right: 18,
              width: 16,
              height: 22,
              borderRadius: 4,
              backgroundColor: "rgba(233,197,92,0.9)",
            }}
          />

          {/* top-down pitch */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 232,
              height: 232,
              borderRadius: 120,
              border: "2px solid rgba(62,227,168,0.45)",
              backgroundImage:
                "radial-gradient(circle at 50% 35%, #2a7d60 0%, #14533d 55%, #0b3026 100%)",
              boxShadow: "inset 0 0 44px rgba(0,0,0,0.45)",
            }}
          >
            {/* center line */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 115,
                width: 2,
                height: 232,
                backgroundColor: "rgba(255,255,255,0.4)",
              }}
            />
            {/* center circle */}
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                border: "3px solid rgba(255,255,255,0.65)",
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Tajawal", data: fontData, weight: 700, style: "normal" },
      ],
    },
  );
}
