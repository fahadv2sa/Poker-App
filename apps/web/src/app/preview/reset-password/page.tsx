import { ResetPasswordForm } from "@/components/reset-password-form";
import { LuAtmosphere } from "@/components/games/lu-screen";

/** PREVIEW ONLY — no auth; renders the set-new-password form. */
export const dynamic = "force-static";

export default function ResetPasswordPreview() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--lu-abyss)] px-4 pb-10 page-top">
      <LuAtmosphere />
      <ResetPasswordForm />
    </main>
  );
}
