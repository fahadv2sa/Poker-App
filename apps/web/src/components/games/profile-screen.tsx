import Link from "next/link";
import { ProfileEditor } from "@/components/profile-editor";
import { LuHeader, LuPanel, LuScreen } from "./lu-screen";
import { HeartIcon, UserIcon } from "./lu-icons";

/**
 * Own profile — gold-on-black redesign (docs/DESIGN_BRIEF.md §8). Built
 * profile-specific (does not reuse the shared ProfileView, which still serves
 * the opponent modal until the table is migrated). The ProfileEditor island
 * keeps all edit logic. Pure presentation otherwise.
 */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function ProfileScreen({
  displayName,
  subtitle,
  avatarUrl,
  avatarSeed,
  level,
  likes,
  rows,
  currentNickname,
  hasAvatar,
}: {
  displayName: string;
  subtitle: string;
  avatarUrl: string | null;
  avatarSeed: string;
  level: number;
  likes: number;
  rows: Array<[string, string]>;
  currentNickname: string | null;
  hasAvatar: boolean;
}) {
  const hue = hueFromSeed(avatarSeed);
  const initial = displayName.charAt(0).toUpperCase();
  return (
    <LuScreen>
      <LuHeader icon={<UserIcon size={22} />} title="الملف الشخصي" subtitle="معلوماتك ورقمك التعريفي" />

      <LuPanel className="mt-3">
        {/* identity */}
        <div className="mb-5 flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={displayName}
              className="size-16 rounded-full object-cover ring-2 ring-[var(--lu-gold-1)]/50 shadow-[0_0_18px_rgb(var(--c-ember)/0.25)]"
            />
          ) : (
            <div
              aria-hidden
              className="grid size-16 place-items-center rounded-full text-2xl font-black text-white ring-2 ring-[var(--lu-gold-1)]/50 shadow-[0_0_18px_rgb(var(--c-ember)/0.25)]"
              style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
            >
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-[var(--lu-cream)]">{displayName}</div>
            <div className="num text-sm text-[var(--lu-tan)]">{subtitle}</div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="lu-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/35">
                المستوى <span className="num font-bold">{level}</span>
              </span>
              <span className="lu-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[var(--lu-ember-glow)] ring-1 ring-[var(--lu-ember)]/35">
                <HeartIcon size={13} /> <span className="num font-bold">{likes}</span>
              </span>
            </div>
          </div>
        </div>

        {/* stat rows */}
        <div className="flex flex-col">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between border-b border-white/[0.07] py-3 last:border-0">
              <span className="text-[var(--lu-tan)]">{label}</span>
              <strong className="num text-[var(--lu-cream)]">{value}</strong>
            </div>
          ))}
        </div>

        <ProfileEditor currentNickname={currentNickname} hasAvatar={hasAvatar} />

        <Link
          href="/stats"
          className="mt-6 flex w-full items-center justify-center rounded-xl border border-[var(--lu-gold-1)]/25 py-3 text-sm font-bold text-[var(--lu-gold-1)] transition hover:bg-white/[0.03]"
        >
          عرض الإحصائيات الكاملة →
        </Link>
      </LuPanel>
    </LuScreen>
  );
}
