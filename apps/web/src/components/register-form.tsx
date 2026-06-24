"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { motion } from "framer-motion";
import { emailSchema, usernameSchema } from "@fp/shared";
import { registerAction } from "@/app/register/actions";
import type { AuthFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { Panel } from "@/components/panel";
import { PasswordConfirmFields } from "@/components/password-confirm-fields";

type FieldStatus = "idle" | "checking" | "invalid" | "taken" | "ok";

const blocking = (s: FieldStatus) => s === "checking" || s === "invalid" || s === "taken";

/** Inline live-validation line under a field. */
function StatusLine({
  status,
  invalidMsg,
  takenMsg,
}: {
  status: FieldStatus;
  invalidMsg: string;
  takenMsg: string;
}) {
  if (status === "checking")
    return <p className="text-xs text-muted-foreground">جارٍ التحقق…</p>;
  if (status === "invalid")
    return <p className="text-xs font-bold text-destructive-foreground">✕ {invalidMsg}</p>;
  if (status === "taken")
    return <p className="text-xs font-bold text-destructive-foreground">✕ {takenMsg}</p>;
  if (status === "ok") return <p className="text-xs font-bold text-emerald-400">✓ متاح</p>;
  return null;
}

/** Signup card (RTL, premium): Email → Username → Password → Confirm Password. */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthFormState | undefined, FormData>(
    registerAction,
    undefined,
  );
  const [pwValid, setPwValid] = useState(false);

  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<FieldStatus>("idle");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<FieldStatus>("idle");

  // On blur: validate format with the SAME shared schema, then hit the read-only
  // availability endpoint. UX only — the server still validates on submit.
  async function check(kind: "email" | "username", value: string) {
    const schema = kind === "email" ? emailSchema : usernameSchema;
    const set = kind === "email" ? setEmailStatus : setUsernameStatus;
    if (value.trim() === "") {
      set("idle");
      return;
    }
    if (!schema.safeParse(value).success) {
      set("invalid");
      return;
    }
    set("checking");
    try {
      const res = await fetch(`/api/auth/availability?${kind}=${encodeURIComponent(value)}`);
      if (!res.ok) {
        set("idle"); // don't block on rate-limit/network; submit re-validates
        return;
      }
      const data = (await res.json()) as Record<string, { valid: boolean; available: boolean }>;
      const f = data[kind];
      set(f?.valid ? (f.available ? "ok" : "taken") : "invalid");
    } catch {
      set("idle");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-md"
    >
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Logo glow className="size-20" />
        <div className="text-2xl font-black">فوتبول بي</div>
        <div className="text-xs font-bold tracking-[0.15em] text-gold">★ تحديات كرة قدم</div>
      </div>

      <Panel accent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl">إنشاء حساب</h1>
            <p className="text-sm text-muted-foreground">أنشئ حسابك وابدأ اللعب</p>
          </div>

          <div className="flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-center text-sm font-bold text-gold">
            🎁 ابدأ برصيد <span className="num">1000</span> كوين مجانًا
          </div>

          {state?.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
              {state.error}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="example@mail.com"
              dir="ltr"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailStatus("idle");
              }}
              onBlur={(e) => check("email", e.target.value)}
              aria-invalid={emailStatus === "invalid" || emailStatus === "taken"}
              required
            />
            <StatusLine
              status={emailStatus}
              invalidMsg="صيغة البريد الإلكتروني غير صحيحة"
              takenMsg="البريد الإلكتروني مستخدم بالفعل"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              placeholder="مثال: messi_10"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setUsernameStatus("idle");
              }}
              onBlur={(e) => check("username", e.target.value)}
              aria-invalid={usernameStatus === "invalid" || usernameStatus === "taken"}
              required
            />
            <StatusLine
              status={usernameStatus}
              invalidMsg="٣–٢٤ حرفًا لاتينية أو أرقام أو شرطة سفلية"
              takenMsg="اسم المستخدم محجوز"
            />
          </div>

          <PasswordConfirmFields onValidityChange={setPwValid} />

          <Button
            type="submit"
            size="lg"
            disabled={pending || !pwValid || blocking(emailStatus) || blocking(usernameStatus)}
            className="btn-cta w-full"
          >
            {pending ? "جارٍ المعالجة…" : "إنشاء الحساب"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            لديك حساب بالفعل؟{" "}
            <Link href="/login" className="font-bold text-primary hover:underline">
              سجّل الدخول
            </Link>
          </p>
        </form>
      </Panel>
    </motion.div>
  );
}
