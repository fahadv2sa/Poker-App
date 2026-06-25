import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadAdminContext } from "@fb/admin-core";
import { readAdminSessionUserId } from "@/lib/admin-session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

// Override at the PAGE (deepest) segment — this is where "Add to Home Screen"
// happens, so the installed admin icon launches /admin/login AND uses the
// distinct admin icon (apple-touch-icon for iOS; Android uses the manifest icons).
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  icons: { apple: [{ url: "/admin-icon-512.png", sizes: "512x512", type: "image/png" }] },
};

export default async function AdminLoginPage() {
  // Already an active admin? Skip the form.
  const userId = await readAdminSessionUserId();
  if (userId && (await loadAdminContext(userId))) redirect("/admin");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-2xl font-black">
          <span className="size-3 rounded-full bg-primary" />
          لوحة التحكم
        </div>
        <p className="mt-1 text-sm text-muted-foreground">دخول المشرفين فقط — منفصل عن دخول اللعبة.</p>
      </div>
      <LoginForm />
    </main>
  );
}
