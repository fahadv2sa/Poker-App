import { RemoveFriendButton } from "@/components/remove-friend-button";
import { RespondRequestButtons } from "@/components/respond-request-buttons";
import { LuHeader, LuPanel, LuScreen } from "./lu-screen";
import { UsersIcon } from "./lu-icons";

/**
 * Friends — gold-on-black redesign (docs/DESIGN_BRIEF.md §8). Pure presentation:
 * the page shapes serializable rows; the respond/remove client islands keep all
 * social logic.
 */
export type FriendPerson = {
  id: string;
  name: string;
  playerNumber: number;
  level: number;
  avatarSrc: string | null;
  seed: string;
};

function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function Avatar({ p }: { p: FriendPerson }) {
  if (p.avatarSrc) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.avatarSrc} alt={p.name} className="size-11 rounded-full object-cover ring-1 ring-[var(--lu-gold-1)]/25" />;
  }
  const hue = hueFromSeed(p.seed);
  return (
    <div
      aria-hidden
      className="grid size-11 place-items-center rounded-full text-sm font-black text-white"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
    >
      {p.name.charAt(0).toUpperCase()}
    </div>
  );
}

function Row({ p, action }: { p: FriendPerson; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar p={p} />
        <div className="min-w-0">
          <div className="truncate font-bold text-[var(--lu-cream)]">{p.name}</div>
          <div className="num text-xs text-[var(--lu-tan)]">
            #{p.playerNumber} · المستوى {p.level}
          </div>
        </div>
      </div>
      {action}
    </div>
  );
}

export function FriendsScreen({ requests, friends }: { requests: FriendPerson[]; friends: FriendPerson[] }) {
  return (
    <LuScreen>
      <LuHeader icon={<UsersIcon size={22} />} title="الأصدقاء" subtitle="قائمة أصدقائك وإدارتهم" />

      {requests.length > 0 ? (
        <LuPanel className="mt-3 mb-5">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-[var(--lu-cream)]">
            الطلبات الواردة
            <span className="num lu-chip rounded-full px-2 py-0.5 text-xs text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/35">
              {requests.length}
            </span>
          </h2>
          <div className="flex flex-col">
            {requests.map((p) => (
              <Row key={p.id} p={p} action={<RespondRequestButtons playerNumber={p.playerNumber} />} />
            ))}
          </div>
        </LuPanel>
      ) : null}

      <LuPanel className="mt-3">
        <h2 className="mb-1 text-lg font-bold text-[var(--lu-cream)]">أصدقائي</h2>
        {friends.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="lu-chip grid size-12 place-items-center rounded-2xl ring-1 ring-[var(--lu-gold-1)]/20">
              <UsersIcon size={22} />
            </span>
            <p className="text-sm text-[var(--lu-tan)]">
              لا أصدقاء بعد — افتح ملف خصم أثناء اللعب وأرسِل له طلب صداقة.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {friends.map((p) => (
              <Row key={p.id} p={p} action={<RemoveFriendButton playerNumber={p.playerNumber} />} />
            ))}
          </div>
        )}
      </LuPanel>
    </LuScreen>
  );
}
