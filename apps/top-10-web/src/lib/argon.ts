import { verify } from "@node-rs/argon2";

/** Verify a password against an argon2id hash from platform.users. */
export function verifyPassword(hashStr: string, password: string): Promise<boolean> {
  return verify(hashStr, password);
}
