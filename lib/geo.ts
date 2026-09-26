/**
 * Hand-rolled GeoJSON helpers for SF neighborhood territory.
 * Coordinates are WGS84 [lng, lat]. No external geo dependency.
 */

export type Position = [number, number];
export type LinearRing = Position[];
export type PolygonCoords = LinearRing[];
export type MultiPolygonCoords = PolygonCoords[];

export type PolygonGeometry = {
  type: "Polygon";
  coordinates: PolygonCoords;
};

export type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: MultiPolygonCoords;
};

export type GeoGeometry = PolygonGeometry | MultiPolygonGeometry;

export type BBox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

/** Approximate SF city bounding box (with a little padding). */
export const SF_BBOX: BBox = {
  minLng: -122.52,
  minLat: 37.7,
  maxLng: -122.35,
  maxLat: 37.84,
};

/** Downtown SF — used as map fallback for unplaced challenges. */
export const SF_CENTER: [number, number] = [37.7749, -122.4194];

/** Ray-casting point-in-ring. Ring is closed or open; holes not considered here. */
export function pointInRing(lng: number, lat: number, ring: LinearRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Outer ring minus holes (GeoJSON polygon rings). */
export function pointInPolygon(
  lng: number,
  lat: number,
  coords: PolygonCoords,
): boolean {
  if (!coords.length) return false;
  if (!pointInRing(lng, lat, coords[0])) return false;
  for (let h = 1; h < coords.length; h++) {
    if (pointInRing(lng, lat, coords[h])) return false;
  }
  return true;
}

export function pointInGeometry(
  lng: number,
  lat: number,
  geometry: GeoGeometry,
): boolean {
  if (geometry.type === "Polygon") {
    return pointInPolygon(lng, lat, geometry.coordinates);
  }
  for (const poly of geometry.coordinates) {
    if (pointInPolygon(lng, lat, poly)) return true;
  }
  return false;
}

export function bboxOf(geometry: GeoGeometry): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const visitRing = (ring: LinearRing) => {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  };

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) visitRing(ring);
  } else {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) visitRing(ring);
    }
  }

  return { minLng, minLat, maxLng, maxLat };
}

export function pointInBBox(lng: number, lat: number, bbox: BBox): boolean {
  return (
    lng >= bbox.minLng &&
    lng <= bbox.maxLng &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  );
}

/**
 * Area-weighted centroid of a closed ring (shoelace). Falls back to vertex
 * average when the ring is degenerate. Coords are [lng, lat].
 */
function ringCentroid(ring: LinearRing): { lat: number; lng: number; area: number } {
  if (ring.length === 0) return { lat: 0, lng: 0, area: 0 };
  const n =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.length - 1
      : ring.length;
  if (n < 3) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += ring[i][0];
      sy += ring[i][1];
    }
    return { lng: sx / Math.max(n, 1), lat: sy / Math.max(n, 1), area: 0 };
  }

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  const area = twiceArea / 2;
  if (Math.abs(twiceArea) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += ring[i][0];
      sy += ring[i][1];
    }
    return { lng: sx / n, lat: sy / n, area: 0 };
  }
  return {
    lng: cx / (3 * twiceArea),
    lat: cy / (3 * twiceArea),
    area: Math.abs(area),
  };
}

/** Area-weighted centroid of the largest outer ring (for label placement). */
export function centroidOf(geometry: GeoGeometry): { lat: number; lng: number } {
  if (geometry.type === "Polygon") {
    const { lat, lng } = ringCentroid(geometry.coordinates[0] ?? []);
    return { lat, lng };
  }
  let best = { lat: 0, lng: 0, area: -1 };
  for (const poly of geometry.coordinates) {
    const c = ringCentroid(poly[0] ?? []);
    if (c.area > best.area) best = c;
  }
  return { lat: best.lat, lng: best.lng };
}

export type NeighborhoodWithBoundary = {
  id: string;
  name: string;
  boundary: unknown;
  centerLat?: number | null;
  centerLng?: number | null;
};

function asGeometry(raw: unknown): GeoGeometry | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as { type?: string; coordinates?: unknown };
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return { type: "Polygon", coordinates: g.coordinates as PolygonCoords };
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    return {
      type: "MultiPolygon",
      coordinates: g.coordinates as MultiPolygonCoords,
    };
  }
  return null;
}

/** First matching neighborhood containing (lng, lat), or null. */
export function findNeighborhoodAt<T extends NeighborhoodWithBoundary>(
  lng: number,
  lat: number,
  list: T[],
): T | null {
  for (const n of list) {
    const geom = asGeometry(n.boundary);
    if (!geom) continue;
    const bbox =
      n.centerLat != null && n.centerLng != null
        ? bboxOf(geom)
        : bboxOf(geom);
    if (!pointInBBox(lng, lat, bbox)) continue;
    if (pointInGeometry(lng, lat, geom)) return n;
  }
  return null;
}

/** Validate a submitted boundary is a well-formed Polygon/MultiPolygon in SF. */
export function validateBoundary(raw: unknown): {
  ok: true;
  geometry: GeoGeometry;
  center: { lat: number; lng: number };
} | { ok: false; error: string } {
  const geometry = asGeometry(raw);
  if (!geometry) {
    return { ok: false, error: "boundary must be a GeoJSON Polygon or MultiPolygon" };
  }

  const rings: LinearRing[] = [];
  if (geometry.type === "Polygon") {
    rings.push(...geometry.coordinates);
  } else {
    for (const poly of geometry.coordinates) rings.push(...poly);
  }
  if (rings.length === 0 || rings[0].length < 4) {
    return { ok: false, error: "polygon must have at least 4 positions" };
  }

  for (const ring of rings) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      // Auto-close is fine for storage; still accept
      ring.push([first[0], first[1]]);
    }
    for (const [lng, lat] of ring) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return { ok: false, error: "coordinates must be finite numbers" };
      }
      if (!pointInBBox(lng, lat, {
        minLng: SF_BBOX.minLng - 0.05,
        minLat: SF_BBOX.minLat - 0.05,
        maxLng: SF_BBOX.maxLng + 0.05,
        maxLat: SF_BBOX.maxLat + 0.05,
      })) {
        return { ok: false, error: "coordinates must be inside the SF area" };
      }
    }
  }

  return { ok: true, geometry, center: centroidOf(geometry) };
}
