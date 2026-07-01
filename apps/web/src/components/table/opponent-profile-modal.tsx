"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SeatAvatar } from "./parts";

type FriendState = "none" | "pending_out" | "pending_in" | "friends";

interface PublicProfile {
  playerNumber: number;
  displayName: string;
  avatarUrl: string | null;
  avatarSeed: string;
  level: number;
  likes: number;
  friends: number;
  wins: number;
  losses: number;
  biggestWin: string;
  biggestLoss: string;
  isSelf: boolean;
  likedByMe: boolean;
  friendState: FriendState;
}

/** Stadium-scoreboard stat tile. */
function StatTile({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-white/10 bg-[var(--fb-surface)]/60 px-2 py-3 text-center">
      <span aria-hidden className="text-base leading-none">
        {icon}
      </span>
      <span className={`num text-base font-extrabold leading-none ${tone}`}>{value}</span>
      <span className="text-[0.62rem] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Rich opponent profile during play — a floodlit scoreboard card. Reuses the
 * public profile endpoint (every value from its source of truth); never reveals
 * cards. Like (toggle) + the full friend-request state machine.
 */
export function OpponentProfileModal({
  playerNumber,
  onClose,
}: {
  playerNumber: number;
  onClose: () => void;
}) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/profile/p/${playerNumber}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json() }))
      .then(({ ok, d }) => {
        if (!alive) return;
        if (ok) setP(d as PublicProfile);
        else setErr((d as { messageAr?: string }).messageAr ?? "تعذّر فتح الملف");
      })
      .catch(() => alive && setErr("تعذّر الاتصال"));
    return () => {
      alive = false;
    };
  }, [playerNumber]);

  async function post(url: string, body: object, method = "POST") {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return res.ok ? await res.json() : null;
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike() {
    if (!p) return;
    const d = await post("/api/social/like", { playerNumber });
    if (d) setP({ ...p, likedByMe: d.liked, likes: d.likes });
  }
  async function sendRequest() {
    if (!p) return;
    const d = await post("/api/social/friend", { playerNumber });
    if (d) setP({ ...p, friendState: d.friendState });
  }
  async function removeOrCancel() {
    if (!p) return;
    const d = await post("/api/social/friend", { playerNumber }, "DELETE");
    if (d) setP({ ...p, friendState: d.friendState });
  }
  async function respond(action: "accept" | "reject") {
    if (!p) return;
    const d = await post("/api/social/friend/respond", { playerNumber, action });
    if (d) setP({ ...p, friendState: d.friendState });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl"
      >
        {err ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">{err}</p>
        ) : !p ? (
          <p className="animate-pulse px-6 py-10 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : (
          <>
            {/* floodlit header */}
            <div
              className="relative flex flex-col items-center gap-2 px-6 pb-5 pt-7"
              style={{
                background:
                  "radial-gradient(120% 90% at 50% -20%, rgb(var(--c-ember)/0.26), transparent 60%), linear-gradient(180deg, rgb(var(--c-gold-2)/0.08), transparent)",
              }}
            >
              <SeatAvatar
                playerNumber={p.playerNumber}
                seed={p.avatarSeed}
                size={84}
                className="ring-2 ring-[var(--lu-gold-1)]/70 shadow-[0_0_28px_rgb(var(--c-ember)/0.35)]"
              />
              <div className="text-center">
                <div className="text-xl font-black">{p.displayName}</div>
                <div className="num text-xs text-muted-foreground">رقم العضوية #{p.playerNumber}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-0.5 text-xs text-gold">
                المستوى <span className="num font-bold">{p.level}</span>
              </span>
            </div>

            {/* scoreboard */}
            <div className="grid grid-cols-3 gap-2 px-5 pb-2">
              <StatTile icon="❤️" label="الإعجابات" value={String(p.likes)} tone="text-[var(--lu-ember-glow)]" />
              <StatTile icon="👥" label="الأصدقاء" value={String(p.friends)} tone="text-[var(--lu-gold-1)]" />
              <StatTile icon="🏆" label="الانتصارات" value={String(p.wins)} tone="text-[var(--lu-gold-1)]" />
              <StatTile icon="💔" label="الخسارات" value={String(p.losses)} tone="text-[var(--fb-danger)]" />
              <StatTile icon="📈" label="أكبر رهان فائز" value={p.biggestWin} tone="text-[var(--lu-gold-1)]" />
              <StatTile icon="📉" label="أكبر رهان خاسر" value={p.biggestLoss} tone="text-[var(--fb-danger)]" />
            </div>

            {/* actions */}
            {!p.isSelf ? (
              <div className="space-y-2 px-5 pb-5 pt-3">
                <Button
                  variant={p.likedByMe ? "default" : "secondary"}
                  disabled={busy}
                  onClick={toggleLike}
                  className="w-full"
                >
                  {p.likedByMe ? "❤️ معجَب" : "🤍 إعجاب"}
                </Button>
                {p.friendState === "none" ? (
                  <Button disabled={busy} onClick={sendRequest} className="btn-gold-cta w-full text-black">
                    ➕ إضافة كصديق
                  </Button>
                ) : p.friendState === "pending_out" ? (
                  <Button variant="secondary" disabled={busy} onClick={removeOrCancel} className="w-full">
                    ⏳ بانتظار القبول · إلغاء
                  </Button>
                ) : p.friendState === "pending_in" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button disabled={busy} onClick={() => respond("accept")} className="btn-gold-cta text-black">
                      قبول الطلب
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => respond("reject")}
                      className="text-destructive hover:text-destructive"
                    >
                      رفض
                    </Button>
                  </div>
                ) : (
                  <Button variant="secondary" disabled={busy} onClick={removeOrCancel} className="w-full">
                    ✓ صديق · إزالة
                  </Button>
                )}
              </div>
            ) : null}
          </>
        )}
        <button
          onClick={onClose}
          className="w-full border-t border-white/10 py-3 text-sm text-muted-foreground transition hover:text-foreground"
        >
          إغلاق
        </button>
      </motion.div>
    </motion.div>
  );
}
