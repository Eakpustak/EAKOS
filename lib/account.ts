/**
 * Account settings rules (password change, profile name, forced change of temporary passwords).
 * Pure: no DB, no session, so the rules can be unit-tested directly.
 *
 * Decisions (also in MEMORY.md section 21):
 *  - Password: at least 10 characters and at most 72 BYTES (bcrypt silently ignores everything after
 *    byte 72, so a longer password would be a lie), not a trivial or very common one, and it must not
 *    contain the person's email name or be their name.
 *  - Changing a password needs the current password and ends every existing sign-in.
 *  - A session is "stale" when it began before the password last changed.
 *  - Wrong current-password attempts are throttled per account (audit-event based).
 */

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD_BYTES = 72;
export const MAX_NAME = 120;
export const PASSWORD_ATTEMPT_LIMIT = 5;
export const PASSWORD_ATTEMPT_WINDOW_MINUTES = 15;

const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "1234567890", "12345678910",
  "0123456789", "qwertyuiop", "qwerty12345", "iloveyou123", "admin12345", "administrator", "welcome123",
  "letmein123", "changeme123", "abcdefghij", "1q2w3e4r5t",
]);

export type PasswordContext = { email: string; displayName: string };

/** Strength rules for any password a person will actually use, or an admin sets as a temporary one. */
export function validatePassword(pw: string, ctx: PasswordContext): string | null {
  if (pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (new TextEncoder().encode(pw).length > MAX_PASSWORD_BYTES) {
    return `Password is too long (the limit is ${MAX_PASSWORD_BYTES} bytes, about ${MAX_PASSWORD_BYTES} plain characters).`;
  }
  if (/^(.)\1+$/u.test(pw)) return "Password cannot be a single repeated character.";
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common. Choose something less guessable.";
  const email = ctx.email.trim().toLowerCase();
  const local = email.split("@")[0] ?? "";
  if (lower === email || (local.length >= 4 && lower.includes(local))) {
    return "Password must not contain your email name.";
  }
  const name = ctx.displayName.trim().toLowerCase();
  if (name.length > 0 && lower === name) return "Password must not be your name.";
  return null;
}

export type PasswordChangeInput = { current: string; next: string; confirm: string };

export function validatePasswordChange(i: PasswordChangeInput, ctx: PasswordContext): string | null {
  if (!i.current) return "Enter your current password.";
  if (i.next !== i.confirm) return "The new password and its confirmation do not match.";
  if (i.next === i.current) return "The new password must be different from the current one.";
  return validatePassword(i.next, ctx);
}

export type NameResult = { value: string } | { error: string };

export function parseDisplayName(raw: string): NameResult {
  const value = raw.replace(/\s+/gu, " ").trim();
  if (!value) return { error: "Name is required." };
  if (value.length > MAX_NAME) return { error: `Name is too long (max ${MAX_NAME}).` };
  if (/[\p{Cc}\p{Cf}]/u.test(value)) return { error: "Name contains characters that are not allowed." };
  return { value };
}

/**
 * A sign-in is stale if it began before the password last changed. `authAtSeconds` is stamped into
 * the session when the person signs in. A sign-in with no stamp predates this feature, so once a
 * password change exists it is treated as stale (fail closed).
 */
export function isSessionStale(authAtSeconds: number | null | undefined, passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt) return false;
  if (typeof authAtSeconds !== "number" || !Number.isFinite(authAtSeconds)) return true;
  return authAtSeconds < Math.floor(passwordChangedAt.getTime() / 1000);
}

export function attemptWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - PASSWORD_ATTEMPT_WINDOW_MINUTES * 60_000);
}

export function isLockedOut(recentDenied: number, limit: number = PASSWORD_ATTEMPT_LIMIT): boolean {
  return recentDenied >= limit;
}

/** Only a few fixed notices are accepted from the login URL, so the query string can't inject text. */
export const LOGIN_NOTICES = {
  "password-changed": "Your password was changed. Sign in again with the new password.",
} as const;
export function loginNotice(key: string | null | undefined): string | null {
  if (!key || !Object.prototype.hasOwnProperty.call(LOGIN_NOTICES, key)) return null;
  return LOGIN_NOTICES[key as keyof typeof LOGIN_NOTICES];
}
