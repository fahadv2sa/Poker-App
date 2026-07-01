"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@fb/top-10-ui";
import { SeatAvatar } from "@fb/table-ui";
import { isBotPlayerNumber } from "@fb/shared";

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

function StatTile({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-white/10 bg-[#0b0908]/60 px-2 py-3 text-center">
      <span aria-hidden className="text-base leading-none">{icon}</span>
      <span className={cn("num text-base font-extrabold leading-none", tone)}>{value}</span>
      <span className="text-[0.62rem] leading-tight text-[var(--lu-tan)]">{label}</span>
    </div>
  );
}

/**
 * Top Ten contestant profile (opened by tapping a seat). Reuses the platform public
 * profile + social endpoints (like / friend), gold-on-black to match Top Ten. Includes
 * a PLACEHOLDER "report cheating" button: it only shows a "تم إرسال البلاغ" notice — no
 * backend yet; it will be wired to the dashboard later. Never reveals cards. Social +
 * report actions are hidden for yourself and for bots (player_number ≥ 900000).
 */
export function TenProfileModal({ playerNumber, onClose }: { playerNumber: number; onClose: () => void }) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isBot = isBotPlayerNumber(playerNumber);

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
  // Placeholder only — no backend. Shows a confirmation; dashboard wiring comes later.
  function reportCheating() {
    setReported(true);
    setToast("تم إرسال البلاغ");
    setTimeout(() => setToast(null), 2500);
  }

  const canAct = !!p && !p.isSelf && !isBot;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] grid place-items-center bg-[var(--lu-abyss)]/85 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[var(--lu-gold-1)]/25 bg-[#0b0908] shadow-2xl"
      >
        {err ? (
          <p className="px-6 py-10 text-center text-sm text-[var(--lu-tan)]">{err}</p>
        ) : !p ? (
          <p className="animate-pulse px-6 py-10 text-center text-sm text-[var(--lu-tan)]">جارٍ التحميل…</p>
        ) : (
          <>
            <div
              className="relative flex flex-col items-center gap-2 px-6 pb-5 pt-7"
              style={{ background: "radial-gradient(120% 90% at 50% -20%, rgba(255,106,26,0.26), transparent 60%)" }}
            >
              <SeatAvatar playerNumber={p.playerNumber} seed={p.avatarSeed} size={84} sizeClass="size-20" className="ring-2 ring-[var(--lu-gold-1)]/70 shadow-[0_0_28px_rgba(255,106,26,0.35)]" />
              <div className="text-center">
                <div className="text-xl font-black text-[var(--lu-cream)]">{p.displayName}</div>
                <div className="num text-xs text-[var(--lu-tan)]">رقم العضوية #{p.playerNumber}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--lu-gold-1)]/40 bg-[var(--lu-gold-2)]/10 px-3 py-0.5 text-xs text-[var(--lu-gold-1)]">
                المستوى <span className="num font-bold">{p.level}</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 px-5 pb-2">
              <StatTile icon="❤️" label="الإعجابات" value={String(p.likes)} tone="text-[var(--lu-ember-glow)]" />
              <StatTile icon="👥" label="الأصدقاء" value={String(p.friends)} tone="text-[var(--lu-gold-1)]" />
              <StatTile icon="🏆" label="الانتصارات" value={String(p.wins)} tone="text-[var(--lu-gold-1)]" />
            </div>

            {canAct ? (
              <div className="space-y-2 px-5 pb-5 pt-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={toggleLike}
                  className={cn(
                    "w-full rounded-xl py-2.5 text-sm font-bold transition disabled:opacity-60",
                    p.likedByMe ? "btn-gold-cta text-black" : "lu-frame text-[var(--lu-cream)]",
                  )}
                >
                  {p.likedByMe ? "❤️ معجَب" : "🤍 إعجاب"}
                </button>
                {p.friendState === "none" ? (
                  <button type="button" disabled={busy} onClick={sendRequest} className="btn-gold-cta w-full rounded-xl py-2.5 text-sm font-bold text-black disabled:opacity-60">
                    ➕ إضافة كصديق
                  </button>
                ) : p.friendState === "pending_out" ? (
                  <button type="button" disabled={busy} onClick={removeOrCancel} className="lu-frame w-full rounded-xl py-2.5 text-sm font-bold text-[var(--lu-cream)] disabled:opacity-60">
                    ⏳ بانتظار القبول · إلغاء
                  </button>
                ) : p.friendState === "pending_in" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy} onClick={() => respond("accept")} className="btn-gold-cta rounded-xl py-2.5 text-sm font-bold text-black disabled:opacity-60">قبول الطلب</button>
                    <button type="button" disabled={busy} onClick={() => respond("reject")} className="lu-frame rounded-xl py-2.5 text-sm font-bold text-[#d9694f] disabled:opacity-60">رفض</button>
                  </div>
                ) : (
                  <button type="button" disabled={busy} onClick={removeOrCancel} className="lu-frame w-full rounded-xl py-2.5 text-sm font-bold text-[var(--lu-cream)] disabled:opacity-60">✓ صديق · إزالة</button>
                )}
                {/* Report cheating — placeholder only (dashboard wiring later). */}
                <button
                  type="button"
                  disabled={reported}
                  onClick={reportCheating}
                  className="w-full rounded-xl border border-[#d9694f]/50 bg-[#d9694f]/12 py-2.5 text-sm font-bold text-[#d9694f] transition hover:bg-[#d9694f]/20 disabled:opacity-60"
                >
                  {reported ? "✓ تم إرسال البلاغ" : "🚩 الإبلاغ عن غش"}
                </button>
              </div>
            ) : (
              <div className="px-5 pb-4 pt-2" />
            )}
          </>
        )}
        <button onClick={onClose} className="w-full border-t border-white/10 py-3 text-sm text-[var(--lu-tan)] transition hover:text-[var(--lu-cream)]">
          إغلاق
        </button>

        {toast ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 mx-auto w-fit rounded-full bg-black/85 px-5 py-2 text-sm text-[var(--lu-cream)] shadow-lg">
            {toast}
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
