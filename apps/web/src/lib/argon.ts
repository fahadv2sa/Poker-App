import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing. @node-rs/argon2 defaults to the Argon2id variant (Section 5
 * requires argon2id). Parameters follow OWASP's recommended baseline.
 */
const HASH_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS);
}

export function verifyPassword(hashStr: string, password: string): Promise<boolean> {
  return verify(hashStr, password);
}
