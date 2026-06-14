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

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});
export type LoginInput = z.infer<typeof loginSchema>;
