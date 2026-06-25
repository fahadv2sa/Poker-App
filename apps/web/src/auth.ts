import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma, touchUserActivity } from "@fb/db";
import { SESSION_INACTIVITY_SECONDS, loginSchema } from "@fb/shared";
import { verifyPassword } from "@/lib/argon";
import { verifyOtpLoginToken } from "@/lib/otp-login-token";
import { findUserByIdentifier } from "@/lib/resolve-identifier";

/**
 * Thrown by `authorize` when the password is correct but the email is NOT yet
 * verified. Surfaces as a CredentialsSignin with `code: "unverified"`, which the
 * login action distinguishes from a bad password to route the user to /verify
 * (rather than show "wrong credentials"). A wrong password still returns null
 * (generic), so this never leaks which accounts exist/are unverified.
 */
export class UnverifiedEmailError extends CredentialsSignin {
  override code = "unverified";
}

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
        identifier: { label: "اسم المستخدم أو البريد الإلكتروني", type: "text" },
        password: { label: "كلمة المرور", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { identifier, password } = parsed.data;
        const user = await findUserByIdentifier(identifier);
        if (!user) return null;

        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) return null;

        // Disabled (banned) by an admin → refuse with a generic failure (never
        // reveal the account is banned). Set/cleared from the admin dashboard.
        if (user.disabledAt) return null;

        // Login gate: password is correct, but block until the email is verified.
        // Existing accounts were grandfathered (email_verified_at backfilled), so
        // only genuinely-unverified new signups hit this.
        if (!user.emailVerifiedAt) throw new UnverifiedEmailError();

        return { id: user.id, name: user.username, playerNumber: user.playerNumber };
      },
    }),
    // Programmatic, password-less login used ONLY right after a successful OTP
    // verification. The `token` is a short-lived signed proof minted server-side by
    // the verify action — never client-supplied identity. Re-checks the user is
    // actually verified before issuing a session.
    Credentials({
      id: "otp-verified",
      credentials: { token: {} },
      authorize: async (raw) => {
        const token = typeof raw?.token === "string" ? raw.token : null;
        if (!token) return null;
        const userId = await verifyOtpLoginToken(token);
        if (!userId) return null;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.emailVerifiedAt || user.disabledAt) return null;
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
      // every session access). Throttled + guarded in @fb/db, so it never adds
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
