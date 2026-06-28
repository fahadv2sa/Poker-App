import type { SVGProps } from "react";

/**
 * Gold line iconography — COPIED from Link Up's lu-icons (apps/web/.../lu-icons.tsx)
 * per the approved "copy into top-10-ui, don't modify Link Up" decision. Every icon
 * strokes with a shared metallic-gold gradient (id "lu-gold"). Render
 * <GoldGradientDefs /> once near the screen root.
 */
export function GoldGradientDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <linearGradient id="lu-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7e6b0" />
          <stop offset="35%" stopColor="#f2d27a" />
          <stop offset="70%" stopColor="#c9962e" />
          <stop offset="100%" stopColor="#8a6a20" />
        </linearGradient>
        <linearGradient id="lu-gold-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7e6b0" />
          <stop offset="50%" stopColor="#d8a93f" />
          <stop offset="100%" stopColor="#8a6a20" />
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
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5)) drop-shadow(0 0 5px rgba(255,179,71,0.35))",
        ...style,
      }}
      {...props}
    >
      {children}
    </svg>
  );
}

export function BackIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M5 12h14" />
      <path {...stroke} d="M13 6l6 6-6 6" />
    </Svg>
  );
}
export function CreateRoomIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M5 4h9l5 5v11H5z" />
      <path {...stroke} d="M14 4v5h5" opacity={0.7} />
      <path {...stroke} d="M11.5 11.5v5M9 14h5" />
    </Svg>
  );
}
export function JoinRoomIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M13 4h6v16h-6" />
      <path {...stroke} d="M3 12h10" />
      <path {...stroke} d="M9.5 8.5 13 12l-3.5 3.5" />
    </Svg>
  );
}
export function StatsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M4 20h16" />
      <path {...stroke} d="M6.5 20v-6M11.5 20V9M16.5 20v-9" />
      <path {...stroke} d="M6.5 12.5 11 7l3 3 4.5-5" opacity={0.7} />
    </Svg>
  );
}
export function TrophyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path {...stroke} d="M7 5H4v1.5A3.5 3.5 0 0 0 7 10M17 5h3v1.5A3.5 3.5 0 0 1 17 10" />
      <path {...stroke} d="M12 13v3M9 20h6M10 20l.5-4h3l.5 4" />
    </Svg>
  );
}
export function GuideIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M12 6c-2-1.3-4.5-1.6-7-1v12c2.5-.6 5-.3 7 1 2-1.3 4.5-1.6 7-1V5c-2.5-.6-5-.3-7 1z" />
      <path {...stroke} d="M12 6v13" />
    </Svg>
  );
}
export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M4 11 12 4l8 7" />
      <path {...stroke} d="M6 9.5V20h12V9.5" />
      <path {...stroke} d="M10 20v-5h4v5" opacity={0.8} />
    </Svg>
  );
}
export function SettingsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="12" r="3.2" />
      <path {...stroke} d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
    </Svg>
  );
}
export function SoundOnIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M4 9.5h3l4.5-3.5v12L7 14.5H4z" />
      <path {...stroke} d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" opacity={0.8} />
    </Svg>
  );
}
export function SoundOffIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M4 9.5h3l4.5-3.5v12L7 14.5H4z" />
      <path {...stroke} d="M15.5 9.5 20 14M20 9.5 15.5 14" />
    </Svg>
  );
}
export function UserIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="8" r="3.6" />
      <path {...stroke} d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}
export function LogoutIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path {...stroke} d="M10 12h9M16 8.5 19.5 12 16 15.5" />
    </Svg>
  );
}
/** Lightning bolt — quick play. */
export function BoltIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M13 2 4.5 13.5H11l-1 8.5L19 10h-6.5L13 2z" />
    </Svg>
  );
}
/** Medal/level mark. */
export function LevelIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="9" r="5" />
      <path {...stroke} d="M9 13.5 7.5 21 12 18.5 16.5 21 15 13.5" />
      <path {...stroke} d="M12 6.5v2.6M10.7 8h2.6" opacity={0.7} />
    </Svg>
  );
}
