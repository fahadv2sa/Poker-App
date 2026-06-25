import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/admin-guard";

// Every /admin route is dynamic + gated. The gate runs here so it protects the
// whole route group: any nested admin page is unreachable without passing it
// (non-admins get a 404, never a hint that the area exists).
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return (
    <div dir="ltr" className="min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
