import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { readPendingReset } from "@/lib/password-reset";
import { VerifyForm } from "@/components/verify-form";
import { LuAtmosphere } from "@/components/games/lu-screen";
import { confirmResetCodeAction, requestResetCodeAction } from "./actions";

export const dynamic = "force-dynamic";

/** Mask an email for display: keep the first 2 local chars + the domain. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const shown = local.slice(0, 2);
  const hidden = "•".repeat(Math.max(1, local.length - shown.length));
  return `${shown}${hidden}@${domain}`;
}

export default async function ResetVerifyPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  const userId = await readPendingReset();
  if (!userId) redirect("/forgot");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) redirect("/forgot");

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--lu-abyss)] px-4 pb-10 page-top">
      <LuAtmosphere />
      <VerifyForm
        maskedEmail={maskEmail(user.email)}
        confirmAction={confirmResetCodeAction}
        resendAction={requestResetCodeAction}
        badge="إعادة تعيين كلمة المرور"
        title="أدخل رمز التحقق"
        submitLabel="تأكيد الرمز"
      />
    </main>
  );
}
