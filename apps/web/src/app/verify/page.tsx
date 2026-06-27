import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { readPendingVerification } from "@/lib/pending-verification";
import { VerifyForm } from "@/components/verify-form";
import { LuAtmosphere } from "@/components/games/lu-screen";
import { confirmCodeAction, requestCodeAction } from "./actions";

export const dynamic = "force-dynamic";

/** Mask an email for display: keep the first 2 local chars + the domain. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const shown = local.slice(0, 2);
  const hidden = "•".repeat(Math.max(1, local.length - shown.length));
  return `${shown}${hidden}@${domain}`;
}

export default async function VerifyPage() {
  // A fully-authed user has no business here.
  const session = await auth();
  if (session?.user?.id) redirect("/");

  // Identity comes only from the signed pending-verification cookie.
  const userId = await readPendingVerification();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!user?.email) redirect("/login");
  if (user.emailVerifiedAt) redirect("/login"); // already verified → just log in

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--lu-abyss)] px-4 pb-10 page-top">
      <LuAtmosphere />
      <VerifyForm
        maskedEmail={maskEmail(user.email)}
        confirmAction={confirmCodeAction}
        resendAction={requestCodeAction}
      />
    </main>
  );
}
