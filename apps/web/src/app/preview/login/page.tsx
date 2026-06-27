import { LoginForm } from "@/components/login-form";
import { LuAtmosphere } from "@/components/games/lu-screen";

/** PREVIEW ONLY — no auth; renders the login form to judge the redesign. */
export const dynamic = "force-static";

export default function LoginPreview() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--lu-abyss)] px-4 pb-10 page-top">
      <LuAtmosphere />
      <LoginForm />
    </main>
  );
}
