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

// Mandatory password confirmation: the two fields must match (also enforced live
// in the UI). Applied to both signup and password-reset.
const passwordsMatch = (d: { password: string; confirmPassword: string }) =>
  d.password === d.confirmPassword;
const passwordsMatchError = {
  message: "كلمتا المرور غير متطابقتين",
  path: ["confirmPassword"],
};

export const registerSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, passwordsMatchError);
export type RegisterInput = z.infer<typeof registerSchema>;

// 6-digit OTP entered on /verify (signup) and the reset code page. Identity comes
// from a server-side signed cookie, NOT this payload — so the body is just the code.
export const otpConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "أدخل رمزًا من ٦ أرقام"),
});
export type OtpConfirmInput = z.infer<typeof otpConfirmSchema>;

// Login + forgot-password identifier: accepts EITHER an email or a username. The
// caller resolves which: an input containing "@" is looked up by email
// (lowercased), otherwise by username. Kept permissive on purpose.
export const identifierSchema = z
  .string()
  .trim()
  .min(1, "أدخل اسم المستخدم أو البريد الإلكتروني")
  .max(254, "المُدخل طويل جدًا");

export const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Forgot-password: who to send the reset code to (email or username).
export const forgotPasswordSchema = z.object({ identifier: identifierSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// Reset-password: the new password, entered twice. Identity comes from the signed
// reset-authorized cookie, not this payload.
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, passwordsMatchError);
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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
