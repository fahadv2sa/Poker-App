import { z } from "zod";

/**
 * Auth input contracts (Zod). Used by both the REST handlers (apps/web) and the
 * Auth.js Credentials provider so validation rules stay in one place.
 */

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
  .max(24, "اسم المستخدم يجب ألا يتجاوز 24 حرفًا")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "اسم المستخدم يقبل الأحرف اللاتينية والأرقام والشرطة السفلية فقط",
  );

export const passwordSchema = z
  .string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .max(128, "كلمة المرور طويلة جدًا");

// Normalized (trimmed + lowercased) so the unique constraint and lookups are
// case-insensitive. Required for new signups; existing email-less rows are
// unaffected (they were grandfathered as verified).
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "البريد الإلكتروني مطلوب")
  .max(254, "البريد الإلكتروني طويل جدًا")
  .email("صيغة البريد الإلكتروني غير صحيحة");

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

// 6-digit OTP entered on /verify. Identity comes from the pending-verification
// cookie (server-side), NOT from this payload — so the body carries only the code.
export const otpConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "أدخل رمزًا من ٦ أرقام"),
});
export type OtpConfirmInput = z.infer<typeof otpConfirmSchema>;

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Identity claims carried by the realtime (Socket.IO) auth token. The web mints
 * this token server-side from the verified Auth.js session and signs it with
 * AUTH_SECRET; the game server verifies the signature and reads the identity
 * from here — never from raw client-supplied handshake fields (Section 16).
 */
export const realtimeClaimsSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  playerNumber: z.number().int(),
});
export type RealtimeClaims = z.infer<typeof realtimeClaimsSchema>;
