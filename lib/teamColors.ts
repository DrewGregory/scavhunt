/**
 * Curated team colors for map / leaderboard identity.
 * Starts with stronger hues for contrast, then soft pastels for variety.
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
  // Pastels (additive) — soft hues across the wheel for more team variety
  "#FFD1DC", // baby pink
  "#FFB7B2", // pastel coral
  "#F4A9A8", // blush
  "#FFDAB9", // peach
  "#FFD8BE", // soft peach
  "#FBCEB1", // apricot
  "#FFF5BA", // pastel yellow
  "#FFEF99", // lemon
  "#E8DAB2", // butter
  "#C8F7C5", // pistachio
  "#B7E4C7", // mint
  "#B2EBB2", // soft mint
  "#9FE2BF", // seafoam
  "#B2C5B2", // sage
  "#AFEEEE", // pale turquoise
  "#A8D5CB", // powder teal
  "#AED9E0", // sky
  "#A7C7E7", // baby blue
  "#AEC6CF", // powder blue
  "#BBE0FC", // soft sky
  "#CCCCFF", // periwinkle
  "#D9BCE6", // soft lavender
  "#E6E6FA", // lavender
  "#C3B1E1", // lilac
  "#E0B0FF", // mauve
  "#D4A5A5", // dusty rose
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
