import { prisma } from "@fp/db";

/**
 * Resolve a login/forgot identifier to a user. The single rule shared by the
 * Credentials provider, the login action, and the forgot-password action: an
 * input containing "@" is treated as an email (looked up lowercased, as stored);
 * otherwise it's a username (exact). Returns the full user row, or null.
 */
export function findUserByIdentifier(identifier: string) {
  const id = identifier.trim();
  return id.includes("@")
    ? prisma.user.findUnique({ where: { email: id.toLowerCase() } })
    : prisma.user.findUnique({ where: { username: id } });
}
