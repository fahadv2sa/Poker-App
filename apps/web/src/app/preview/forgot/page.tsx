import { ForgotForm } from "@/components/forgot-form";
import { LuAtmosphere } from "@/components/games/lu-screen";

/** PREVIEW ONLY — no auth; renders the forgot-password form. */
export const dynamic = "force-static";

export default function ForgotPreview() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--lu-abyss)] px-4 pb-10 page-top">
      <LuAtmosphere />
      <ForgotForm />
    </main>
  );
}
