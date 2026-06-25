import { createHttpAdminGameServerClient } from "@fb/admin-core";

/**
 * Build the admin game-server client from the server env. The base URL prefers
 * the internal URL, then the public one; the token gates the admin endpoints
 * (the live-control endpoints are closed unless INTERNAL_API_TOKEN is set on both
 * sides). Server-only — never import from a client component.
 */
export function adminGameServerClient() {
  const base =
    process.env.GAME_SERVER_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ??
    "http://localhost:4000";
  return createHttpAdminGameServerClient({ baseUrl: base, token: process.env.INTERNAL_API_TOKEN });
}
