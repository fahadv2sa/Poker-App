import Link from "next/link";
import type { ReactNode } from "react";

/** Format a coin amount (BigInt string) with thousands separators. */
export function fmtCoins(v: string | number | bigint): string {
  try {
    const n = typeof v === "bigint" ? v : BigInt(typeof v === "number" ? Math.trunc(v) : v);
    return n.toLocaleString("en-US");
  } catch {
    return String(v);
  }
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-card/70 p-5 ${className ?? ""}`}>
      {title ? <h2 className="mb-3 text-lg font-black">{title}</h2> : null}
      {children}
    </section>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-card/70 p-4">
      <div className="num text-3xl font-black leading-none">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      {sub ? <div className="num mt-0.5 text-[0.7rem] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-black">{title}</h1>
      {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
    </header>
  );
}

export function SearchForm({
  action,
  placeholder,
  defaultValue,
}: {
  action: string;
  placeholder: string;
  defaultValue?: string;
}) {
  return (
    <form action={action} className="mb-4 flex gap-2">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50"
      />
      <button className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10">
        بحث
      </button>
    </form>
  );
}

export function Pager({
  basePath,
  q,
  skip,
  take,
  total,
  extra,
}: {
  basePath: string;
  q?: string;
  skip: number;
  take: number;
  total: number;
  extra?: Record<string, string | undefined>;
}) {
  const link = (s: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    for (const [key, val] of Object.entries(extra ?? {})) {
      if (val) params.set(key, val);
    }
    if (s > 0) params.set("skip", String(s));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + take, total);
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span className="num">
        {from}–{to} / {total}
      </span>
      <div className="flex gap-2">
        {skip > 0 ? (
          <Link
            href={link(Math.max(0, skip - take))}
            className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5"
          >
            السابق
          </Link>
        ) : null}
        {skip + take < total ? (
          <Link
            href={link(skip + take)}
            className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5"
          >
            التالي
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Shared table shell — a bordered, horizontally-scrollable wrapper. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[40rem] text-right text-sm">{children}</table>
    </div>
  );
}

/** A labelled key/value row for detail cards. */
export function KV({ k, v, num }: { k: string; v: ReactNode; num?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={num ? "num font-bold" : "font-bold"}>{v}</dd>
    </div>
  );
}

/** Format an ISO timestamp compactly (Latin numerals, dd/mm/yy hh:mm). */
export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}
