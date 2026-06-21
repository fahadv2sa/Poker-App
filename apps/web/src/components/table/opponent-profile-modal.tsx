"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ProfileView } from "@/components/profile-view";

interface PublicProfile {
  playerNumber: number;
  displayName: string;
  avatarUrl: string | null;
  avatarSeed: string;
  level: number;
  likes: number;
  matches: number;
  wins: number;
  biggestWin: string;
  isSelf: boolean;
  likedByMe: boolean;
  isFriend: boolean;
}

/**
 * On-demand opponent profile during play: fetches the PUBLIC profile by
 * playerNumber and reuses the shared ProfileView (read-only — never any cards).
 * Adds Like (toggle) + Add/Remove-friend, both server-authoritative. Rendered
 * inside the table's <AnimatePresence> so it animates in/out.
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

  async function toggleLike() {
    if (!p) return;
    setBusy(true);
    try {
      const res = await fetch("/api/social/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerNumber }),
      });
      const d = await res.json();
      if (res.ok) setP({ ...p, likedByMe: d.liked, likes: d.likes });
    } finally {
      setBusy(false);
    }
  }

  async function toggleFriend() {
    if (!p) return;
    setBusy(true);
    try {
      const res = await fetch("/api/social/friend", {
        method: p.isFriend ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerNumber }),
      });
      const d = await res.json();
      if (res.ok) setP({ ...p, isFriend: d.isFriend });
    } finally {
      setBusy(false);
    }
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
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl"
      >
        {err ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{err}</p>
        ) : !p ? (
          <p className="animate-pulse py-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : (
          <>
            <ProfileView
              displayName={p.displayName}
              subtitle={`#${p.playerNumber}`}
              avatarUrl={p.avatarUrl}
              avatarSeed={p.avatarSeed}
              level={p.level}
              likes={p.likes}
              rows={[
                ["المباريات", String(p.matches)],
                ["الانتصارات", String(p.wins)],
                ["أكبر رهان رابح", `${p.biggestWin} كوين`],
              ]}
            />
            {!p.isSelf ? (
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button
                  variant={p.likedByMe ? "default" : "secondary"}
                  disabled={busy}
                  onClick={toggleLike}
                >
                  {p.likedByMe ? "❤️ معجَب" : "🤍 إعجاب"}
                </Button>
                <Button
                  variant={p.isFriend ? "default" : "secondary"}
                  disabled={busy}
                  onClick={toggleFriend}
                >
                  {p.isFriend ? "✓ صديق" : "➕ إضافة كصديق"}
                </Button>
              </div>
            ) : null}
          </>
        )}
        <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
          إغلاق
        </Button>
      </motion.div>
    </motion.div>
  );
}
