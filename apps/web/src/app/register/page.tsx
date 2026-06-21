import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthForm } from "@/components/auth-form";
import { registerAction } from "./actions";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 pb-10 page-top">
      <div aria-hidden className="arena-rail" />
      <AuthForm action={registerAction} mode="register" />
    </main>
  );
}
