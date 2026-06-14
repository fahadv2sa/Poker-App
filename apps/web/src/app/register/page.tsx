import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthForm } from "@/components/auth-form";
import { registerAction } from "./actions";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="shell" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <AuthForm action={registerAction} mode="register" />
    </main>
  );
}
