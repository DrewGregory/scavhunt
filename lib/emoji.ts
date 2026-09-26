/**
 * Single-emoji helpers (Extended_Pictographic / ZWJ / keycap / flag).
 */

const EMOJI_UNIT =
  "(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?)*)" +
  "|(?:[0-9#*]\\uFE0F?\\u20E3)" +
  "|(?:\\p{Regional_Indicator}{2})";

export const EMOJI_UNIT_RE = new RegExp(`^(?:${EMOJI_UNIT})`, "u");
const LEADING_WS_RE = /^[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]+/u;

/** First emoji unit in a string, or null. */
export function firstEmoji(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const m = trimmed.match(EMOJI_UNIT_RE);
  return m?.[0] ?? null;
}

/**
 * If the title starts with emoji(s), return the **first** one and the title
 * with the entire leading emoji run (and following whitespace) removed.
 */
export function splitLeadingEmoji(title: string): {
  emoji: string;
  rest: string;
} | null {
  const raw = title ?? "";
  const first = raw.match(EMOJI_UNIT_RE);
  if (!first) return null;

  // Consume the full leading run (extra emojis / spaces) so the title is clean,
  // but only keep the first unit in `emoji`.
  let i = first[0].length;
  while (i < raw.length) {
    const ws = raw.slice(i).match(LEADING_WS_RE);
    if (ws) {
      const after = raw.slice(i + ws[0].length);
      if (!EMOJI_UNIT_RE.test(after)) break;
      i += ws[0].length;
    }
    const em = raw.slice(i).match(EMOJI_UNIT_RE);
    if (!em) break;
    i += em[0].length;
  }

  const trailWs = raw.slice(i).match(LEADING_WS_RE);
  if (trailWs) i += trailWs[0].length;

  const rest = raw.slice(i).trim();
  if (!rest) return null;

  return { emoji: first[0], rest };
}
