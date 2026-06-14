import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@fp/db";
import { loginSchema } from "@fp/shared";
import { verifyPassword } from "@/lib/argon";

/**
 * Auth.js (Credentials) — Section 19.8. Username + password, session stored in a
 * JWT carried by an httpOnly cookie. Runs in the Node.js runtime because it
 * touches Prisma and the native argon2 verifier.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
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
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.playerNumber = (user as { playerNumber?: number }).playerNumber;
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
