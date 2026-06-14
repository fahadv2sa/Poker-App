import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthForm } from "@/components/auth-form";
import { loginAction } from "./actions";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <AuthForm action={loginAction} mode="login" />
    </main>
  );
}
