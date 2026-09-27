/**
 * Curated team colors for map / leaderboard identity.
 * Tuned for pairwise contrast (avoid near-neighbors like indigo≈violet).
 * Custom #RRGGBB is always allowed via the RGB picker.
 */
export const TEAM_COLOR_PALETTE = [
  "#E11D48", // rose
  "#EA580C", // orange
  "#CA8A04", // gold
  "#65A30D", // lime
  "#16A34A", // green
  "#0D9488", // teal
  "#0891B2", // cyan
  "#2563EB", // blue
  "#4F46E5", // indigo
  "#7C3AED", // violet
  "#C026D3", // fuchsia
  "#DB2777", // pink
  "#9F1239", // burgundy
  "#9A3412", // rust
  "#3F6212", // olive
  "#115E59", // deep teal
  "#1E3A8A", // navy
  "#581C87", // deep purple
  "#BE185D", // magenta
  "#44403C", // stone
] as const;

/** Alias used when auto-assigning colors to new teams. */
export const TEAM_COLORS = TEAM_COLOR_PALETTE;

export const DEFAULT_TEAM_COLOR: string = TEAM_COLOR_PALETTE[7];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isTeamColorHex(value: string): boolean {
  return HEX_RE.test(value);
}

export function normalizeTeamColor(value: string | null | undefined): string {
  if (value && isTeamColorHex(value)) return value.toUpperCase();
  return DEFAULT_TEAM_COLOR;
}
