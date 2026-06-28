import * as React from "react";
import { cn } from "./cn.js";

/** Gold pressable button (Link Up's .lu-btn surface). */
export function GoldButton({
  className,
  variant = "gold",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "gold" | "ghost" | "danger" }) {
  const base =
    "lu-btn inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    gold: "text-[#2a1f02] [background:linear-gradient(180deg,#f7e6b0,#c9962e)]",
    ghost: "lu-chip text-[var(--lu-cream)]",
    danger: "text-white [background:linear-gradient(180deg,#e26a6a,#a33)]",
  } as const;
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

/** Elevated gold-framed surface. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("lu-frame rounded-2xl p-5", className)} {...props} />;
}

/** Section title in metal gold. */
export function GoldTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("lu-gold-text lu-gold-title text-3xl font-extrabold", className)} {...props} />;
}

/** Small inline chip/badge. */
export function Chip({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("lu-chip inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm text-[var(--lu-cream)]", className)}
      {...props}
    />
  );
}
