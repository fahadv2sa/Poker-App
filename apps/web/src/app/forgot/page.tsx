import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ForgotForm } from "@/components/forgot-form";

export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 pb-10 page-top">
      <div aria-hidden className="arena-rail" />
      <ForgotForm />
    </main>
  );
}
