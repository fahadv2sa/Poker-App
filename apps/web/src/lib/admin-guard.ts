import { notFound } from "next/navigation";
import { loadAdminContext, type AdminContext } from "@fb/admin-core";
import { auth } from "@/auth";

/**
 * Server-side gate for the entire /admin area.
 *
 * Resolves the session, loads the admin context, and returns it for an active
 * admin. For ANYONE else — unauthenticated, or a logged-in non-admin — it calls
 * `notFound()` (a 404), never a 403 or a redirect. The admin surface is therefore
 * invisible to non-admins: there is no signal that /admin even exists. This is the
 * single place page-level admin authorization is decided, and it runs ONLY under
 * /admin, so it adds nothing to player-facing traffic.
 */
export async function requireAdminPage(): Promise<AdminContext> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) notFound();

  const ctx = await loadAdminContext(userId);
  if (!ctx) notFound();

  return ctx;
}
