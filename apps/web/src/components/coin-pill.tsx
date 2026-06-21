import { cn } from "@/lib/utils";

/**
 * Gold coin HUD pill — one consistent currency treatment used in every header.
 * Visual only; `amount` is rendered verbatim (already-formatted string/number).
 */
export function CoinPill({
  amount,
  showLabel = true,
  className,
}: {
  amount: string | number;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("coin-pill text-sm", className)}>
      🪙 <span className="num font-semibold">{amount}</span>
      {showLabel ? <span className="font-normal opacity-80">كوين</span> : null}
    </span>
  );
}
