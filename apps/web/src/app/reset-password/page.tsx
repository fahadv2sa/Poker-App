import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { readResetAuthorized } from "@/lib/password-reset";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { LuAtmosphere } from "@/components/games/lu-screen";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  // Only reachable with a valid reset-authorized cookie (set after the reset OTP
  // was verified). Otherwise start the flow over.
  const userId = await readResetAuthorized();
  if (!userId) redirect("/forgot");

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--lu-abyss)] px-4 pb-10 page-top">
      <LuAtmosphere />
      <ResetPasswordForm />
    </main>
  );
}
