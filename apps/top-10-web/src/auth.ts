import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma, touchUserActivity } from "@fb/db";
import { SESSION_INACTIVITY_SECONDS, loginSchema } from "@fb/shared";
import { verifyPassword } from "@/lib/argon";

/**
 * Top Ten — its OWN Auth.js (Credentials), against the SHARED platform.users with
 * the SHARED AUTH_SECRET (approved Q3: one identity across both games, no SSO
 * handoff). Mirrors Link Up's auth contract. Login only — registration/verification
 * live in the platform/Link Up app; a user signs in here with an existing account.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_INACTIVITY_SECONDS, updateAge: 60 * 60 },
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
        const isEmail = identifier.includes("@");
        const user = await prisma.user.findFirst({
          where: isEmail ? { email: identifier.toLowerCase() } : { username: identifier },
        });
        if (!user) return null;
        if (!(await verifyPassword(user.passwordHash, password))) return null;
        if (user.disabledAt) return null;
        if (!user.emailVerifiedAt) return null;
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
      // Treat any token use (sign-in + every session access) as activity, so the
      // game-server's idle-session gate never rejects an actively-playing user.
      // Throttled + guarded in @fb/db; never breaks auth on a DB error.
      if (typeof token.uid === "string") {
        try {
          await touchUserActivity(token.uid);
        } catch {
          /* fail-open */
        }
      }
      return token;
    },
    session({ session, token }) {
      const uid = token.uid as string | undefined;
      if (uid) session.user.id = uid;
      const playerNumber = token.playerNumber as number | undefined;
      if (typeof playerNumber === "number") session.user.playerNumber = playerNumber;
      return session;
    },
  },
});
