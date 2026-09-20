/** Common SF neighborhoods used for seeding / default bracket init (16). */
export const SF_NEIGHBORHOODS = [
  "Mission",
  "Castro",
  "Noe Valley",
  "Bernal Heights",
  "Potrero Hill",
  "SoMa",
  "North Beach",
  "Marina",
  "Pacific Heights",
  "Haight-Ashbury",
  "Inner Richmond",
  "Outer Sunset",
  "Hayes Valley",
  "Excelsior",
  "Bayview",
  "Twin Peaks",
] as const;

export function shuffleInPlace<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
