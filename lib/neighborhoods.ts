/** Canonical SF neighborhoods used for seeding / admin bracket init. */
export const SF_NEIGHBORHOODS = [
  "Mission",
  "Castro",
  "Noe Valley",
  "Bernal Heights",
  "Potrero Hill",
  "Dogpatch",
  "SoMa",
  "Mission Bay",
  "Financial District",
  "Chinatown",
  "North Beach",
  "Russian Hill",
  "Nob Hill",
  "Pacific Heights",
  "Marina",
  "Cow Hollow",
  "Presidio",
  "Inner Richmond",
  "Outer Richmond",
  "Inner Sunset",
  "Outer Sunset",
  "Parkside",
  "Twin Peaks",
  "Glen Park",
  "Excelsior",
  "Outer Mission",
  "Visitacion Valley",
  "Bayview",
  "Hunters Point",
  "Haight-Ashbury",
  "Cole Valley",
  "Western Addition",
  "Fillmore",
  "Japantown",
  "Hayes Valley",
  "Tenderloin",
  "Civic Center",
  "Embarcadero",
  "Seacliff",
  "West Portal",
  "Forest Hill",
  "Diamond Heights",
  "Portola",
  "Ingleside",
  "Oceanview",
  "Merced Heights",
  "Balboa Park",
  "Treasure Island",
] as const;

export function shuffleInPlace<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
