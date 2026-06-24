/** Shared action-state for OTP code-entry forms (signup verify + password reset). */
export interface OtpFormState {
  error?: string;
  sent?: boolean;
  /** When a resend is on cooldown, seconds until the next allowed request. */
  cooldownSeconds?: number;
}
