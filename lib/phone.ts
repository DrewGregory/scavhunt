import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";

/** Normalize freeform US-leaning phone input to E.164. Returns null if invalid. */
export function normalizePhone(
  raw: string,
  defaultCountry: "US" = "US",
): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.format("E.164");
}

/** Pretty-print a phone as the user types (US-leaning). */
export function formatPhoneInput(
  raw: string,
  defaultCountry: "US" = "US",
): string {
  const trimmed = raw.trimStart();
  if (!trimmed) return "";
  return new AsYouType(defaultCountry).input(trimmed);
}

export function maskPhone(e164: string): string {
  if (e164.length < 4) return "••••";
  return `••••${e164.slice(-4)}`;
}

/** Pretty-print a stored E.164 number for display (US-leaning). */
export function formatPhoneDisplay(
  e164: string,
  defaultCountry: "US" = "US",
): string {
  const parsed = parsePhoneNumberFromString(e164, defaultCountry);
  if (!parsed) return e164;
  return parsed.formatNational();
}

/** Lowercase and validate a login email. Returns null if unusable. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "your email";
  return `${user.slice(0, 1)}•••@${domain}`;
}
