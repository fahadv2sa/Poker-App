import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";
import { LuAtmosphere } from "@/components/games/lu-screen";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  const { reset } = await searchParams;
  const notice = reset
    ? "تم تغيير كلمة المرور بنجاح. سجّل الدخول بكلمتك الجديدة."
    : undefined;

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--lu-abyss)] px-4 pb-10 page-top">
      <LuAtmosphere />
      <LoginForm notice={notice} />
    </main>
  );
}
