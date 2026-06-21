/**
 * Read-only profile display, reused by the OWN profile page and the OPPONENT
 * profile modal — one view, two callers. Purely presentational (no client hooks,
 * no data fetching), so it renders in both server and client components. Shows
 * only what the caller passes, so the public view simply omits private rows
 * (e.g. balance). Never renders cards — game privacy is unaffected.
 */

function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export interface ProfileViewProps {
  displayName: string;
  subtitle: string;
  avatarUrl: string | null;
  avatarSeed: string;
  level: number;
  likes: number;
  rows: Array<[string, string]>;
}

export function ProfileView({
  displayName,
  subtitle,
  avatarUrl,
  avatarSeed,
  level,
  likes,
  rows,
}: ProfileViewProps) {
  const hue = hueFromSeed(avatarSeed);
  const initial = displayName.charAt(0).toUpperCase();
  return (
    <div>
      <div className="mb-5 flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={displayName}
            className="size-16 rounded-full object-cover ring-1 ring-border"
          />
        ) : (
          <div
            className="grid size-16 place-items-center rounded-full text-2xl font-black text-white"
            style={{
              background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))`,
            }}
            aria-hidden
          >
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{displayName}</div>
          <div className="num text-sm text-muted-foreground">{subtitle}</div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">
              المستوى <span className="num font-bold">{level}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
              ❤️ <span className="num font-bold">{likes}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-border/60 py-3 last:border-0"
          >
            <span className="text-muted-foreground">{label}</span>
            <strong className="num">{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
