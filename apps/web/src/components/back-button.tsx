"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Icon-only back control for internal page headers (replaces the old "← القائمة"
 * text button). Goes to the previous page when there's history, otherwise falls
 * back to `backHref` (home). RTL: the chevron points right (toward "back"). The
 * tap sound + press animation come from the app-wide handlers, so none here.
 */
export function BackButton({
  backHref = "/",
  className,
}: {
  backHref?: string;
  className?: string;
}) {
  const router = useRouter();
  const onClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(backHref);
  };
  return (
    <button
      type="button"
      aria-label="رجوع"
      onClick={onClick}
      className={cn(
        "kebab-btn grid size-10 shrink-0 place-items-center rounded-2xl text-foreground/85 hover:text-foreground",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}
