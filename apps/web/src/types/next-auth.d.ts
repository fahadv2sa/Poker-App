import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      playerNumber: number;
    } & DefaultSession["user"];
  }

  interface User {
    playerNumber?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    playerNumber?: number;
  }
}
