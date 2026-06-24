"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AVATAR_MAX_BYTES, isAvatarMime, validateNickname } from "@fb/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Client editor for the two user-owned fields: nickname + avatar. Edits go
 *  through the server (PATCH /api/profile/me, POST /api/profile/avatar). */
export function ProfileEditor({
  currentNickname,
  hasAvatar,
}: {
  currentNickname: string | null;
  hasAvatar: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState(currentNickname ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveNickname(e: React.FormEvent) {
    e.preventDefault();
    const v = validateNickname(nickname);
    if ("error" in v) return setMsg({ ok: false, text: v.error });
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) return setMsg({ ok: false, text: data.messageAr ?? "تعذّر الحفظ" });
      setMsg({ ok: true, text: "تم حفظ النيك نيم" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!isAvatarMime(file.type)) return setMsg({ ok: false, text: "الصيغة غير مدعومة (PNG/JPEG/WEBP)" });
    if (file.size === 0 || file.size > AVATAR_MAX_BYTES)
      return setMsg({ ok: false, text: "حجم الصورة يجب ألا يتجاوز 256 كيلوبايت" });
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) return setMsg({ ok: false, text: data.messageAr ?? "تعذّر رفع الصورة" });
      setMsg({ ok: true, text: "تم تحديث الصورة" });
      router.refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!res.ok) return setMsg({ ok: false, text: "تعذّر حذف الصورة" });
      setMsg({ ok: true, text: "تمت إزالة الصورة" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4 border-t border-border/60 pt-6">
      <h2 className="text-lg font-bold">تعديل الملف</h2>

      {msg ? (
        <div
          className={
            msg.ok
              ? "rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary"
              : "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
          }
        >
          {msg.text}
        </div>
      ) : null}

      <form onSubmit={saveNickname} className="flex flex-col gap-2">
        <Label htmlFor="nickname">النيك نيم</Label>
        <div className="flex gap-2">
          <Input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="اسمك المعروض (اختياري)"
            maxLength={20}
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            حفظ
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          2–20 حرفًا. اتركه فارغًا للعودة إلى اسم المستخدم.
        </span>
      </form>

      <div className="flex flex-col gap-2">
        <Label>الصورة الرمزية</Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAvatar(f);
            }}
            className="text-sm file:me-3 file:rounded-md file:border file:border-input file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
          {hasAvatar ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void removeAvatar()}>
              إزالة الصورة
            </Button>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">PNG أو JPEG أو WEBP، بحد أقصى 256 كيلوبايت.</span>
      </div>
    </div>
  );
}
