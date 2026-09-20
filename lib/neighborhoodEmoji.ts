/** Deterministic emoji for a neighborhood name (no DB field needed yet). */
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

export function neighborhoodEmoji(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return EMOJIS[hash % EMOJIS.length];
}
