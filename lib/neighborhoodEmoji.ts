/** Deterministic emoji for a neighborhood name when no custom emoji is set. */
const EMOJIS = [
  "🌉",
  "🌁",
  "🏙️",
  "🏞️",
  "🌊",
  "☕",
  "🌮",
  "🎨",
  "🌲",
  "🚲",
  "🚋",
  "🏛️",
  "🌅",
  "🎷",
  "🥟",
  "🦞",
  "🏖️",
  "⛰️",
  "🏘️",
  "🪴",
];

export function hashNeighborhoodEmoji(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return EMOJIS[hash % EMOJIS.length];
}

/** Prefer a stored emoji; otherwise derive one from the name. */
export function neighborhoodEmoji(
  name: string,
  storedEmoji?: string | null,
): string {
  const trimmed = storedEmoji?.trim();
  if (trimmed) return trimmed;
  return hashNeighborhoodEmoji(name);
}
