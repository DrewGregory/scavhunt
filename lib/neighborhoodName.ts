/**
 * Neighborhood.name is @unique globally. Soft-deleted rows would otherwise
 * block reusing a name (e.g. combine A+B → A, then rename A to "B").
 * Archive by rewriting the name so the display label is free again.
 */
export function archivedNeighborhoodName(name: string, id: string): string {
  const suffix = `.__archived__.${id}`;
  const maxLen = 80;
  const baseMax = Math.max(1, maxLen - suffix.length);
  const base = name.endsWith(suffix)
    ? name.slice(0, -suffix.length)
    : name;
  return `${base.slice(0, baseMax)}${suffix}`;
}

export function isArchivedNeighborhoodName(name: string): boolean {
  return name.includes(".__archived__.");
}
