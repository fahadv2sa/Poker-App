/**
 * Thrown when an admin action violates a guard (e.g. ban/delete yourself, delete
 * an admin). Carries a stable `code` so the UI layer can localize the message
 * without parsing English text — keeps admin-core language-agnostic.
 */
export class AdminActionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AdminActionError";
    this.code = code;
  }
}
