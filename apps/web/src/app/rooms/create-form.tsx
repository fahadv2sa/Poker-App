"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Create-room form. POSTs to /api/rooms, then opens the new table. */
export function CreateRoomForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: String(form.get("roomName") ?? ""),
          isPrivate,
          maxPlayers: Number(form.get("maxPlayers") ?? 6),
          password: isPrivate ? String(form.get("password") ?? "") : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.messageAr ?? "تعذّر إنشاء الغرفة");
        return;
      }
      router.push(`/table/${data.id}`);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="field">
        <label htmlFor="roomName">اسم الغرفة</label>
        <input id="roomName" name="roomName" className="input" placeholder="طاولة الأبطال" required />
      </div>

      <div className="row" style={{ gap: "1rem" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="maxPlayers">أقصى عدد لاعبين</label>
          <input
            id="maxPlayers"
            name="maxPlayers"
            type="number"
            min={2}
            max={8}
            defaultValue={6}
            className="input num"
          />
        </div>
        <label className="row" style={{ gap: "0.5rem", alignSelf: "flex-end", paddingBottom: "0.7rem" }}>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          غرفة خاصة
        </label>
      </div>

      {isPrivate ? (
        <div className="field">
          <label htmlFor="password">كلمة مرور الغرفة</label>
          <input id="password" name="password" type="password" className="input" />
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary block" disabled={pending}>
        {pending ? "جارٍ الإنشاء…" : "إنشاء وفتح الطاولة"}
      </button>
    </form>
  );
}
