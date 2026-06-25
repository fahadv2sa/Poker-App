/** Map an admin-core error (AdminActionError code / WalletError code) to an
 *  Arabic message for the dashboard. Robust to bundling (checks name + code,
 *  not instanceof). */
const CODES: Record<string, string> = {
  NOT_FOUND: "المستخدم غير موجود.",
  BOT: "لا يمكن جعل حساب آلي مشرفًا.",
  NOT_SUPER: "فقط المشرف الأعلى يمكنه منح صلاحية المشرف الأعلى.",
  SELF_SUPER: "لا يمكنك إزالة أو تخفيض صلاحيتك كمشرف أعلى.",
  LAST_SUPER: "لا يمكن إزالة أو تخفيض آخر مشرف أعلى نشط.",
  BAD_PERMISSION: "صلاحية غير معروفة.",
  NONZERO: "أدخل مبلغًا غير صفري.",
  SELF_DISABLE: "لا يمكنك تعطيل حسابك.",
  SELF_DELETE: "لا يمكنك حذف حسابك.",
  DELETE_ADMIN: "لا يمكن حذف حساب مشرف — أزِل صلاحية الإشراف أولًا.",
};

export function localizeAdminError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  const code = (e as { code?: string } | null)?.code;
  if (name === "AdminActionError" && code && CODES[code]) return CODES[code];
  if (code === "INSUFFICIENT_FUNDS") return "الرصيد لا يكفي لهذا الخصم.";
  return "تعذّر تنفيذ العملية.";
}
