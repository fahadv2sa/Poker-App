import { RegisterForm } from "@/components/register-form";
import { LuAtmosphere } from "@/components/games/lu-screen";

/** PREVIEW ONLY — no auth; renders the register form to judge the redesign. */
export const dynamic = "force-static";

export default function RegisterPreview() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--lu-abyss)] px-4 pb-10 page-top">
      <LuAtmosphere />
      <RegisterForm />
    </main>
  );
}
