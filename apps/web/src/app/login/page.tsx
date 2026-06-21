import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthForm } from "@/components/auth-form";
import { loginAction } from "./actions";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 pb-10 page-top">
      <div aria-hidden className="arena-rail" />
      <AuthForm action={loginAction} mode="login" />
    </main>
  );
}
