/**
 * Profile layer contracts — nickname validation + avatar limits, shared by the
 * server (authoritative) and the client (instant feedback). The nickname is a
 * display name only; `username`/`playerNumber` remain the unique identifiers, so
 * nicknames are NOT required to be unique.
 */

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;
/** Letters of any script (incl. Arabic), digits, space, underscore, hyphen. */
export const NICKNAME_PATTERN = /^[\p{L}\p{N} _-]+$/u;

export const AVATAR_MAX_BYTES = 256 * 1024; // 256 KB
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AvatarMime = (typeof AVATAR_MIME_TYPES)[number];

export type NicknameResult = { value: string | null } | { error: string };

/**
 * Normalize + validate a nickname. Empty / whitespace-only → `null` (the display
 * reverts to the username). Otherwise enforces length + allowed characters.
 */
export function validateNickname(raw: unknown): NicknameResult {
  if (typeof raw !== "string") return { error: "النيك نيم غير صالح" };
  const v = raw.trim();
  if (v.length === 0) return { value: null };
  if (v.length < NICKNAME_MIN || v.length > NICKNAME_MAX) {
    return { error: `النيك نيم يجب أن يكون بين ${NICKNAME_MIN} و${NICKNAME_MAX} حرفًا` };
  }
  if (!NICKNAME_PATTERN.test(v)) {
    return { error: "النيك نيم يحتوي على رموز غير مسموحة" };
  }
  return { value: v };
}

export function isAvatarMime(mime: string): mime is AvatarMime {
  return (AVATAR_MIME_TYPES as readonly string[]).includes(mime);
}
