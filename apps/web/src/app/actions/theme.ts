"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEFAULT_THEME_ID, isValidThemeId, THEME_COOKIE } from "@fb/theme/themes";

/**
 * Server action: persist the platform theme by NUMBER. For server-rendered callers
 * (the dashboard, later). Honoured by SSR only when THEME_SWITCHING_ENABLED is true —
 * so calling it while switching is dormant sets the cookie but changes nothing for
 * players. Pair with a client refresh (or it revalidates the layout here).
 */
export async function setThemeCookie(id: number): Promise<{ id: number }> {
  const resolved = isValidThemeId(id) ? id : DEFAULT_THEME_ID;
  const store = await cookies();
  store.set(THEME_COOKIE, String(resolved), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { id: resolved };
}
