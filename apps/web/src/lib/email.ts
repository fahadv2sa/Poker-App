import "server-only";
import { Resend } from "resend";
import { OTP_TTL_SECONDS } from "@fb/shared";

/**
 * Transactional email via Resend. SERVER-ONLY (holds RESEND_API_KEY). The client
 * is created lazily at send time so a missing key never breaks the build/import —
 * only an actual send fails, and loudly.
 *
 * `EMAIL_FROM` must be an address on a Resend-VERIFIED sending domain (we use the
 * dedicated mail subdomain, e.g. "Football B <no-reply@mail.fmgtech.dev>").
 */

export class EmailConfigError extends Error {}
export class EmailSendError extends Error {}

function resendClient(): { resend: Resend; from: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) throw new EmailConfigError("RESEND_API_KEY is not set");
  if (!from) throw new EmailConfigError("EMAIL_FROM is not set");
  return { resend: new Resend(apiKey), from };
}

/** Arabic / RTL OTP email. Returns nothing on success; throws on failure. */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  // Dev convenience: with no Resend key configured OUTSIDE production, log the
  // code to the server console instead of sending, so local end-to-end testing
  // needs zero email setup. NEVER active in production (would leak codes).
  if (process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY) {
    console.log(`[dev] OTP email → ${to}: ${code}`);
    return;
  }

  const { resend, from } = resendClient();
  const minutes = Math.round(OTP_TTL_SECONDS / 60);

  const subject = `رمز تأكيد حسابك في فوتبول بي: ${code}`;
  const text = `رمز التحقق الخاص بك هو ${code}\nصالح لمدة ${minutes} دقائق. لا تشارك هذا الرمز مع أحد.\nإذا لم تطلب هذا الرمز فتجاهل هذه الرسالة.`;
  const html = `<!doctype html>
<html dir="rtl" lang="ar">
  <body style="margin:0;background:#0b1020;font-family:system-ui,Segoe UI,Tahoma,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px;color:#e7ecf5;text-align:center;">
      <div style="font-size:22px;font-weight:800;margin-bottom:4px;">⚽ فوتبول بي</div>
      <div style="font-size:13px;color:#9fb0c9;margin-bottom:24px;">تأكيد البريد الإلكتروني</div>
      <p style="font-size:15px;color:#cdd7e8;margin:0 0 16px;">استخدم الرمز التالي لتأكيد حسابك:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#ffd166;background:#131a30;border:1px solid #2a3656;border-radius:14px;padding:18px 0;margin:0 0 16px;">${code}</div>
      <p style="font-size:13px;color:#9fb0c9;margin:0;">صالح لمدة ${minutes} دقائق. لا تُشارك هذا الرمز مع أحد.</p>
      <p style="font-size:12px;color:#6b7a99;margin:20px 0 0;">إذا لم تطلب هذا الرمز، فتجاهل هذه الرسالة.</p>
    </div>
  </body>
</html>`;

  const { error } = await resend.emails.send({ from, to, subject, text, html });
  if (error) {
    throw new EmailSendError(`Resend failed: ${error.message ?? "unknown error"}`);
  }
}
