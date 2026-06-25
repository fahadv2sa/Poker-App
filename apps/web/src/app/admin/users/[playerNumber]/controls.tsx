"use client";

import { useActionState } from "react";
import {
  adjustCoinsAction,
  deleteUserAction,
  resetPasswordAction,
  setDisabledAction,
  setVerifiedAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = {};
const inputCls =
  "w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50";
const btnCls =
  "rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-50";

function Msg({ state }: { state: ActionState }) {
  if (state.error) return <p className="mt-2 text-sm text-destructive">{state.error}</p>;
  if (state.ok && state.message) return <p className="mt-2 text-sm text-primary">{state.message}</p>;
  return null;
}

export interface UserControlsProps {
  playerNumber: number;
  verified: boolean;
  disabled: boolean;
  perms: {
    adjust: boolean;
    verify: boolean;
    ban: boolean;
    reset: boolean;
    delete: boolean;
  };
}

export function UserControls({ playerNumber, verified, disabled, perms }: UserControlsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {perms.adjust ? <CoinControl playerNumber={playerNumber} /> : null}
      {perms.verify ? <VerifyControl playerNumber={playerNumber} verified={verified} /> : null}
      {perms.ban ? <DisableControl playerNumber={playerNumber} disabled={disabled} /> : null}
      {perms.reset ? <ResetControl playerNumber={playerNumber} /> : null}
      {perms.delete ? <DeleteControl playerNumber={playerNumber} /> : null}
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-card/60 p-4">
      <h3 className="mb-2 text-sm font-black">{title}</h3>
      {children}
    </div>
  );
}

function CoinControl({ playerNumber }: { playerNumber: number }) {
  const [state, action, pending] = useActionState(
    adjustCoinsAction.bind(null, playerNumber),
    INITIAL,
  );
  return (
    <Box title="تعديل الرصيد (عبر السجل)">
      <form action={action} className="space-y-2">
        <div className="flex gap-2">
          <input name="amount" inputMode="numeric" placeholder="المبلغ (− للخصم)" className={`${inputCls} num`} />
          <button disabled={pending} className={btnCls}>
            تعديل
          </button>
        </div>
        <input name="reason" placeholder="السبب (اختياري)" className={inputCls} />
        <Msg state={state} />
      </form>
    </Box>
  );
}

function VerifyControl({ playerNumber, verified }: { playerNumber: number; verified: boolean }) {
  const [state, action, pending] = useActionState(
    setVerifiedAction.bind(null, playerNumber, !verified),
    INITIAL,
  );
  return (
    <Box title="توثيق البريد">
      <form action={action}>
        <button disabled={pending} className={btnCls}>
          {verified ? "إلغاء التوثيق" : "توثيق الآن"}
        </button>
        <Msg state={state} />
      </form>
    </Box>
  );
}

function DisableControl({ playerNumber, disabled }: { playerNumber: number; disabled: boolean }) {
  const [state, action, pending] = useActionState(
    setDisabledAction.bind(null, playerNumber, !disabled),
    INITIAL,
  );
  return (
    <Box title={disabled ? "إعادة تفعيل الحساب" : "تعطيل الحساب (حظر)"}>
      <form action={action}>
        <button disabled={pending} className={btnCls}>
          {disabled ? "تفعيل" : "تعطيل"}
        </button>
        <Msg state={state} />
      </form>
    </Box>
  );
}

function ResetControl({ playerNumber }: { playerNumber: number }) {
  const [state, action, pending] = useActionState(
    resetPasswordAction.bind(null, playerNumber),
    INITIAL,
  );
  return (
    <Box title="إعادة تعيين كلمة المرور">
      <form action={action} className="space-y-2">
        <input name="password" type="password" placeholder="كلمة مرور جديدة (8+)" className={inputCls} />
        <button disabled={pending} className={btnCls}>
          تعيين
        </button>
        <Msg state={state} />
      </form>
    </Box>
  );
}

function DeleteControl({ playerNumber }: { playerNumber: number }) {
  const [state, action, pending] = useActionState(
    deleteUserAction.bind(null, playerNumber),
    INITIAL,
  );
  return (
    <Box title="حذف الحساب نهائيًا">
      <form action={action} className="space-y-2">
        <p className="text-xs text-muted-foreground">
          إجراء لا يمكن التراجع عنه. اكتب رقم اللاعب{" "}
          <span className="num font-bold">{playerNumber}</span> للتأكيد.
        </p>
        <input name="confirm" inputMode="numeric" placeholder="رقم اللاعب" className={`${inputCls} num`} />
        <button disabled={pending} className={`${btnCls} border-destructive/40 text-destructive`}>
          حذف
        </button>
        <Msg state={state} />
      </form>
    </Box>
  );
}
