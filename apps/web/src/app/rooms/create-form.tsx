"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="roomName">اسم الغرفة</Label>
        <Input id="roomName" name="roomName" placeholder="طاولة الأبطال" required />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="maxPlayers">أقصى عدد لاعبين</Label>
          <Input
            id="maxPlayers"
            name="maxPlayers"
            type="number"
            min={2}
            max={8}
            defaultValue={6}
            className="num"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          غرفة خاصة
        </label>
      </div>

      {isPrivate ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">كلمة مرور الغرفة</Label>
          <Input id="password" name="password" type="password" />
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "جارٍ الإنشاء…" : "إنشاء وفتح الطاولة"}
      </Button>
    </form>
  );
}
