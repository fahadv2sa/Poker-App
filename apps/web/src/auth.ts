import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma, touchUserActivity } from "@fp/db";
import { SESSION_INACTIVITY_SECONDS, loginSchema } from "@fp/shared";
import { verifyPassword } from "@/lib/argon";

/**
 * Auth.js (Credentials) — Section 19.8. Username + password, session stored in a
 * JWT carried by an httpOnly cookie. Runs in the Node.js runtime because it
 * touches Prisma and the native argon2 verifier.
 *
 * Inactivity auto-logout (humans): `maxAge` is the 2-day inactivity window — the
 * JWT carries a signed expiry and Auth.js re-issues it (rolling) on activity, so
 * 2 days with no request expires the cookie and the next `auth()` returns null →
 * existing redirects send the user to /login. A short `updateAge` keeps the
 * rolling window tight (the token is refreshed at most once per hour). The `jwt`
 * callback also advances `users.last_active_at` (throttled) so the game-server's
 * handshake check sees HTTP activity too.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: SESSION_INACTIVITY_SECONDS, // 2 days of inactivity → expired
    updateAge: 60 * 60, // re-issue the rolling token at most hourly
  },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "اسم المستخدم", type: "text" },
        password: { label: "كلمة المرور", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;

        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) return null;

        return { id: user.id, name: user.username, playerNumber: user.playerNumber };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.playerNumber = (user as { playerNumber?: number }).playerNumber;
      }
      // Treat any token use as activity (this callback runs on sign-in AND on
      // every session access). Throttled + guarded in @fp/db, so it never adds
      // a real write on most requests and never breaks auth on a DB error.
      if (typeof token.uid === "string") {
        await touchUserActivity(token.uid);
      }
      return token;
    },
    session({ session, token }) {
      const uid = token.uid as string | undefined;
      if (uid) session.user.id = uid;
      const playerNumber = token.playerNumber as number | undefined;
      if (typeof playerNumber === "number") {
        session.user.playerNumber = playerNumber;
      }
      return session;
    },
  },
});
