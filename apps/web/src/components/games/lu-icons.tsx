import type { SVGProps } from "react";

/**
 * Gold line iconography for the Link Up redesign. Every icon strokes with a
 * shared metallic-gold gradient (id "lu-gold") so they read as real gold rather
 * than a flat color. Re-authored natively for this app (no external code).
 *
 * Render <GoldGradientDefs /> once near the root of the screen so the gradient
 * id is available to every icon below.
 */

export function GoldGradientDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <linearGradient id="lu-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--c-gold-soft))" />
          <stop offset="35%" stopColor="var(--fb-gold)" />
          <stop offset="70%" stopColor="var(--fb-gold-strong)" />
          <stop offset="100%" stopColor="var(--fb-gold-deep)" />
        </linearGradient>
        <linearGradient id="lu-gold-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--c-gold-soft))" />
          <stop offset="50%" stopColor="rgb(var(--c-amber-2))" />
          <stop offset="100%" stopColor="var(--fb-gold-deep)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const stroke = {
  fill: "none",
  stroke: "url(#lu-gold)",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, style, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{
        filter: "drop-shadow(0 1px 1px rgb(var(--c-black)/0.5)) drop-shadow(0 0 5px rgb(var(--c-ember-glow)/0.35))",
        ...style,
      }}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Back chevron (RTL: points right, toward the page the user came from). */
export function BackIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M5 12h14" />
      <path {...stroke} d="M13 6l6 6-6 6" />
    </Svg>
  );
}

/** Create room — a plus inside a doorway/frame. */
export function CreateRoomIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M5 4h9l5 5v11H5z" />
      <path {...stroke} d="M14 4v5h5" opacity={0.7} />
      <path {...stroke} d="M11.5 11.5v5M9 14h5" />
    </Svg>
  );
}

/** Join room — a door with an arrow entering. */
export function JoinRoomIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M13 4h6v16h-6" />
      <path {...stroke} d="M3 12h10" />
      <path {...stroke} d="M9.5 8.5 13 12l-3.5 3.5" />
    </Svg>
  );
}

/** Stats — an ascending bar chart. */
export function StatsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M4 20h16" />
      <path {...stroke} d="M6.5 20v-6M11.5 20V9M16.5 20v-9" />
      <path {...stroke} d="M6.5 12.5 11 7l3 3 4.5-5" opacity={0.7} />
    </Svg>
  );
}

/** Bank — a classical facade with columns. */
export function BankIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M3.5 9 12 4l8.5 5H3.5z" />
      <path {...stroke} d="M5.5 9v8M9.5 9v8M14.5 9v8M18.5 9v8" />
      <path {...stroke} d="M4 20h16" />
    </Svg>
  );
}

/** Trophy — the global rank mark. */
export function TrophyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path {...stroke} d="M7 5H4v1.5A3.5 3.5 0 0 0 7 10M17 5h3v1.5A3.5 3.5 0 0 1 17 10" />
      <path {...stroke} d="M12 13v3M9 20h6M10 20l.5-4h3l.5 4" />
    </Svg>
  );
}

/** Crown — premium / subscription mark (solid gold). */
export function CrownIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path
        fill="url(#lu-gold-fill)"
        stroke="url(#lu-gold)"
        strokeWidth={1.2}
        strokeLinejoin="round"
        d="M4 17.6 2.6 7.8 7.6 10.7 12 4.6 16.4 10.7 21.4 7.8 20 17.6Z"
      />
      <path {...stroke} strokeWidth={1.2} d="M4.6 15h14.8" opacity={0.65} />
      <circle cx={12} cy={8.4} r={0.9} fill="url(#lu-gold)" stroke="none" />
      <circle cx={6} cy={11.2} r={0.7} fill="url(#lu-gold)" stroke="none" />
      <circle cx={18} cy={11.2} r={0.7} fill="url(#lu-gold)" stroke="none" />
    </Svg>
  );
}

/** Guide — an open book. */
export function GuideIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M12 6c-2-1.3-4.5-1.6-7-1v12c2.5-.6 5-.3 7 1 2-1.3 4.5-1.6 7-1V5c-2.5-.6-5-.3-7 1z" />
      <path {...stroke} d="M12 6v13" />
    </Svg>
  );
}

/** Home. */
export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M4 11 12 4l8 7" />
      <path {...stroke} d="M6 9.5V20h12V9.5" />
      <path {...stroke} d="M10 20v-5h4v5" opacity={0.8} />
    </Svg>
  );
}

/** Settings — a gear. */
export function SettingsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="12" r="3.2" />
      <path
        {...stroke}
        d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"
      />
    </Svg>
  );
}

/** Sound on — speaker with waves. */
export function SoundOnIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M4 9.5h3l4.5-3.5v12L7 14.5H4z" />
      <path {...stroke} d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" opacity={0.8} />
    </Svg>
  );
}

/** Sound off — speaker muted. */
export function SoundOffIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M4 9.5h3l4.5-3.5v12L7 14.5H4z" />
      <path {...stroke} d="M15.5 9.5 20 14M20 9.5 15.5 14" />
    </Svg>
  );
}

/** Geometric brand emblem — a faceted crest/monogram (Section 8.10). */
export function EmblemIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M12 2.5l7 2.6v6.1c0 4.6-3 7.7-7 9.3-4-1.6-7-4.7-7-9.3V5.1l7-2.6z" />
      <path {...stroke} d="M12 7.5l3.2 3.2L12 13.9 8.8 10.7 12 7.5z" />
      <path {...stroke} d="M12 2.8v4.4M12 14v6.3" opacity={0.7} />
    </Svg>
  );
}

/** Likes — heart. */
export function HeartIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M12 20s-7-4.3-7-9.3a3.7 3.7 0 0 1 7-1.7 3.7 3.7 0 0 1 7 1.7c0 5-7 9.3-7 9.3z" />
    </Svg>
  );
}

/** Single user / profile. */
export function UserIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="8" r="3.6" />
      <path {...stroke} d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

/** Friends — two people. */
export function UsersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="9" cy="8" r="3" />
      <path {...stroke} d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path {...stroke} d="M16 5.5a3 3 0 0 1 0 5.6M16.5 14.2A5.5 5.5 0 0 1 20.5 19" opacity={0.75} />
    </Svg>
  );
}

/** Overflow menu — three dots. */
export function MenuDotsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5" cy="12" r="1.4" fill="url(#lu-gold-fill)" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="url(#lu-gold-fill)" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="url(#lu-gold-fill)" stroke="none" />
    </Svg>
  );
}

/** Locked / coming-soon padlock. */
export function LockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect {...stroke} x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path {...stroke} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path {...stroke} d="M12 14v2.5" />
    </Svg>
  );
}

/** Logout — door + arrow. */
export function LogoutIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path {...stroke} d="M10 12h9M16 8.5 19.5 12 16 15.5" />
    </Svg>
  );
}

/** Coin — currency token. */
export function CoinIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="12" r="8.2" />
      <circle {...stroke} cx="12" cy="12" r="5.4" opacity={0.6} />
      <path {...stroke} d="M12 9v6M10.5 10.2h2.2a1.3 1.3 0 0 1 0 2.6h-1.4a1.3 1.3 0 0 0 0 2.6H13" opacity={0.85} />
    </Svg>
  );
}
