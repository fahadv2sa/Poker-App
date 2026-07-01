/**
 * TEMPORARY theme-proof surface (Phase 1 acceptance gate). A public, DB-free page that
 * renders every design token and every themed utility class as deterministic swatches,
 * so the Playwright visual-regression suite (e2e/theme-visual.spec.ts) can prove the
 * centralization + tokenization is pixel-identical (0-diff) before/after. Remove once
 * Phase 1 is signed off. No layout/logic of the real product depends on this.
 */

export const dynamic = "force-static";

const CHANNELS = [
  "abyss", "base", "panel", "surface", "surface-2", "felt-bg", "cream", "tan",
  "gold-hi", "gold-soft", "gold-mid", "gold-1", "gold-2", "gold-3", "gold-deep",
  "gold-shadow", "gold-ink", "ember", "ember-2", "ember-glow", "ember-hi",
  "danger", "danger-deep", "danger-hi", "amber", "black", "white",
  "felt-green-1", "felt-green-2", "felt-green-3", "navy",
];

const SEMANTICS = [
  "bg", "base", "panel", "surface", "surface-2", "felt", "text", "text-muted",
  "gold", "gold-strong", "gold-deep", "ember", "ember-glow", "danger", "amber",
];

const LEGACY = [
  "background", "foreground", "card", "card-foreground", "popover", "primary",
  "secondary", "muted", "muted-foreground", "accent", "destructive", "border",
  "input", "ring", "gold",
];

const LU = [
  "abyss", "base", "panel", "cream", "tan", "ember", "ember-glow",
  "gold-1", "gold-2", "gold-3",
];

function Swatch({ label, style }: { label: string; style: React.CSSProperties }) {
  return (
    <div style={{ width: 96 }}>
      <div data-probe={label} style={{ height: 44, borderRadius: 8, border: "1px solid #7777", ...style }} />
      <div style={{ fontSize: 9, color: "#ccc", marginTop: 2, fontFamily: "monospace", wordBreak: "break-all" }}>{label}</div>
    </div>
  );
}

export default function ThemePreview() {
  return (
    <main style={{ background: "#101010", minHeight: "100vh", padding: 16, color: "#eee" }}>
      <h2 style={{ fontSize: 14 }}>channels --c-*</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CHANNELS.map((c) => (
          <Swatch key={c} label={`--c-${c}`} style={{ background: `rgb(var(--c-${c}))` }} />
        ))}
      </div>

      <h2 style={{ fontSize: 14, marginTop: 16 }}>semantic --fb-*</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {SEMANTICS.map((c) => (
          <Swatch key={c} label={`--fb-${c}`} style={{ background: `var(--fb-${c})` }} />
        ))}
      </div>

      <h2 style={{ fontSize: 14, marginTop: 16 }}>legacy tokens</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {LEGACY.map((c) => (
          <Swatch key={c} label={`--${c}`} style={{ background: `var(--${c})` }} />
        ))}
        <Swatch label="--felt" style={{ background: "var(--felt)" }} />
      </div>

      <h2 style={{ fontSize: 14, marginTop: 16 }}>legacy --lu-* aliases</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {LU.map((c) => (
          <Swatch key={c} label={`--lu-${c}`} style={{ background: `var(--lu-${c})` }} />
        ))}
      </div>

      <h2 style={{ fontSize: 14, marginTop: 16 }}>utility classes</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        <div data-probe="lu-frame" className="lu-frame" style={{ width: 120, height: 64, borderRadius: 12 }} />
        <button data-probe="lu-btn" className="lu-btn lu-frame" style={{ width: 120, height: 44, borderRadius: 12 }} />
        <span data-probe="lu-chip" className="lu-chip" style={{ display: "grid", width: 44, height: 44, borderRadius: 12 }} />
        <div data-probe="lu-gold-text" className="lu-gold-text lu-gold-title" style={{ fontSize: 28, fontWeight: 900 }}>توب</div>
        <div data-probe="lu-divider" className="lu-divider" style={{ width: 140 }} />
        <div data-probe="lu-orb" className="lu-orb" style={{ width: 64, height: 64, borderRadius: "50%" }} />
        <div data-probe="lu-sub" className="lu-sub" style={{ width: 120, height: 64, borderRadius: 12 }} />
        <div data-probe="lu-felt" className="lu-felt" style={{ width: 140, height: 84, borderRadius: 16 }} />
        <div data-probe="lu-glow-ember" className="lu-glow-ember" style={{ width: 44, height: 44, borderRadius: 8, background: "#111" }} />
        <div data-probe="lu-turn" className="lu-turn" style={{ width: 44, height: 44, borderRadius: 8, background: "#111" }} />
        <div data-probe="panel" className="panel" style={{ width: 120, height: 64 }} />
        <div data-probe="tile" className="tile" style={{ width: 120, height: 64 }} />
        <div data-probe="felt" className="felt" style={{ width: 120, height: 64, borderRadius: 12 }} />
        <span data-probe="coin-pill" className="coin-pill">١٠٠</span>
        <div data-probe="section-ico" className="section-ico" />
        <div data-probe="section-ico-gold" className="section-ico section-ico-gold" />
        <div data-probe="section-ico-cyan" className="section-ico section-ico-cyan" />
        <button data-probe="btn-cta" className="btn-cta" style={{ width: 120, height: 40, borderRadius: 10 }} />
        <button data-probe="btn-gold-cta" className="btn-gold-cta" style={{ width: 120, height: 40, borderRadius: 10 }} />
        <div data-probe="play-orb" className="play-orb" style={{ width: 72, height: 72, borderRadius: "50%" }} />
        <div data-probe="stat-chip" className="stat-chip" style={{ ["--tone" as string]: "var(--gold)" }} />
        <div data-probe="room-card" className="room-card" style={{ width: 120, height: 64 }} />
        <div data-probe="home-square" className="home-square" style={{ width: 64, height: 64 }} />
        <div data-probe="glow-primary" className="glow-primary" style={{ width: 44, height: 44, borderRadius: 8, background: "#111" }} />
        <div data-probe="glow-gold" className="glow-gold" style={{ width: 44, height: 44, borderRadius: 8, background: "#111" }} />
        <div data-probe="lu-sub-rim" className="lu-sub-rim" style={{ width: 120, height: 40, borderRadius: 12 }} />
      </div>
    </main>
  );
}
