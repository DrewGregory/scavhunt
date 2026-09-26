import polygonClipping from "polygon-clipping";
import type { GeoGeometry, Position } from "./geo";
import { bboxOf, centroidOf } from "./geo";

type ClippingGeom = polygonClipping.Geom;
type Ring = Position[];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];

function toClipping(geom: GeoGeometry): ClippingGeom {
  return geom.coordinates as unknown as ClippingGeom;
}

function fromClipping(merged: ClippingGeom): GeoGeometry | null {
  if (!merged || merged.length === 0) return null;
  const coords = merged as MultiPolygonCoords;
  if (coords.length === 1) {
    return { type: "Polygon", coordinates: coords[0] };
  }
  return { type: "MultiPolygon", coordinates: coords };
}

/** Match MapTopology quantization (~1.1m) so shared edges dissolve on union. */
const SNAP = 1e5;

function roundCoord(n: number, scale = SNAP): number {
  return Math.round(n * scale) / scale;
}

export function roundGeometry(
  geom: GeoGeometry,
  scale = SNAP,
): GeoGeometry {
  if (geom.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geom.coordinates.map((ring) =>
        ring.map((p) => [roundCoord(p[0], scale), roundCoord(p[1], scale)] as Position),
      ),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: geom.coordinates.map((poly) =>
      poly.map((ring) =>
        ring.map(
          (p) => [roundCoord(p[0], scale), roundCoord(p[1], scale)] as Position,
        ),
      ),
    ),
  };
}

/** Approx ring area in m² near SF — used to drop sliver holes/crumbs. */
function ringAreaM2(ring: Ring): number {
  if (!ring?.length) return 0;
  const lat = ring[0][1];
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    twice += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(twice / 2) * mPerDegLng * mPerDegLat;
}

/**
 * After polygon-clipping unions, strip interior rings (Leaflet strokes them as
 * "internal borders") and drop tiny MultiPolygon crumbs. Prefer a single Polygon.
 */
export function cleanMergedGeometry(geom: GeoGeometry): GeoGeometry {
  const MIN_PART_M2 = 500;
  const polys: MultiPolygonCoords =
    geom.type === "Polygon"
      ? [geom.coordinates]
      : geom.coordinates;

  const cleaned: MultiPolygonCoords = [];
  for (const poly of polys) {
    if (!poly?.[0]?.length) continue;
    if (ringAreaM2(poly[0]) < MIN_PART_M2) continue;
    // Keep outer ring only — holes are almost always clipping artifacts.
    cleaned.push([poly[0]]);
  }

  if (cleaned.length === 0) {
    let best: Ring | null = null;
    let bestA = -1;
    for (const poly of polys) {
      const a = ringAreaM2(poly[0] ?? []);
      if (a > bestA) {
        bestA = a;
        best = poly[0] ?? null;
      }
    }
    if (best) cleaned.push([best]);
  }

  if (cleaned.length <= 1) {
    return {
      type: "Polygon",
      coordinates: cleaned[0] ?? [[]],
    };
  }

  // Try to dissolve remaining parts (gaps from float mismatch).
  let acc: ClippingGeom = cleaned[0] as unknown as ClippingGeom;
  for (let i = 1; i < cleaned.length; i++) {
    acc = polygonClipping.union(
      acc,
      cleaned[i] as unknown as ClippingGeom,
    );
  }
  const redissolved = fromClipping(acc);
  if (!redissolved) {
    return { type: "MultiPolygon", coordinates: cleaned };
  }

  // One more pass: strip any holes the re-union introduced.
  const polys2: MultiPolygonCoords =
    redissolved.type === "Polygon"
      ? [redissolved.coordinates]
      : redissolved.coordinates;
  const outers: MultiPolygonCoords = polys2
    .filter((p) => p?.[0]?.length && ringAreaM2(p[0]) >= MIN_PART_M2)
    .map((p) => [p[0]]);

  if (outers.length === 1) {
    return { type: "Polygon", coordinates: outers[0]! };
  }
  if (outers.length === 0) {
    return redissolved.type === "Polygon"
      ? { type: "Polygon", coordinates: [redissolved.coordinates[0]!] }
      : redissolved;
  }
  return { type: "MultiPolygon", coordinates: outers };
}

/** Union several neighborhood polygons into one cleaned shape. */
export function unionGeometries(geoms: GeoGeometry[]): GeoGeometry | null {
  if (geoms.length === 0) return null;
  // Snap first so nearly-shared borders actually dissolve.
  let acc: ClippingGeom = toClipping(roundGeometry(geoms[0]!));
  for (let i = 1; i < geoms.length; i++) {
    acc = polygonClipping.union(acc, toClipping(roundGeometry(geoms[i]!)));
  }
  const out = fromClipping(acc);
  if (!out) return null;
  return cleanMergedGeometry(roundGeometry(out));
}

/**
 * Split a geometry with a line through (cutLng, cutLat) at `angleDeg`.
 * angleDeg = 0 → vertical cut (same as classic west/east split).
 * Positive angle rotates the cut counterclockwise (degrees).
 *
 * Returns `west` / `east` for API compatibility: the piece whose centroid has
 * the smaller longitude is `west` (keeps original name); the other is `east`.
 */
export function splitGeometryByLine(
  geom: GeoGeometry,
  cutLng: number,
  cutLat: number,
  angleDeg = 0,
): { west: GeoGeometry; east: GeoGeometry } | { error: string } {
  const bb = bboxOf(geom);
  if (
    cutLng <= bb.minLng ||
    cutLng >= bb.maxLng ||
    cutLat <= bb.minLat ||
    cutLat >= bb.maxLat
  ) {
    return { error: "Cut must pass through the neighborhood" };
  }

  const rad = (angleDeg * Math.PI) / 180;
  // Normal pointing "east" when angleDeg=0. Line direction is perpendicular.
  const nx = Math.cos(rad);
  const ny = Math.sin(rad);
  const dx = -Math.sin(rad);
  const dy = Math.cos(rad);

  const span =
    Math.hypot(bb.maxLng - bb.minLng, bb.maxLat - bb.minLat) * 4 + 0.05;

  const ax = cutLng - dx * span;
  const ay = cutLat - dy * span;
  const bx = cutLng + dx * span;
  const by = cutLat + dy * span;

  const halfPlane = (side: 1 | -1): GeoGeometry => {
    const ox = nx * span * side;
    const oy = ny * span * side;
    return {
      type: "Polygon",
      coordinates: [
        [
          [ax, ay],
          [bx, by],
          [bx + ox, by + oy],
          [ax + ox, ay + oy],
          [ax, ay],
        ],
      ],
    };
  };

  const negRaw = fromClipping(
    polygonClipping.intersection(toClipping(geom), toClipping(halfPlane(-1))),
  );
  const posRaw = fromClipping(
    polygonClipping.intersection(toClipping(geom), toClipping(halfPlane(1))),
  );
  if (!negRaw || !posRaw) {
    return { error: "Split produced an empty piece — move or rotate the cut" };
  }

  const neg = cleanMergedGeometry(roundGeometry(negRaw));
  const pos = cleanMergedGeometry(roundGeometry(posRaw));
  const negC = centroidOf(neg);
  const posC = centroidOf(pos);

  // Preserve "west keeps name" convention for vertical cuts.
  if (negC.lng <= posC.lng) {
    return { west: neg, east: pos };
  }
  return { west: pos, east: neg };
}

/** @deprecated Prefer splitGeometryByLine — kept for callers that only pass cutLng. */
export function splitGeometryVertical(
  geom: GeoGeometry,
  cutLng: number,
): { west: GeoGeometry; east: GeoGeometry } | { error: string } {
  const bb = bboxOf(geom);
  const cutLat = (bb.minLat + bb.maxLat) / 2;
  return splitGeometryByLine(geom, cutLng, cutLat, 0);
}

export function geometryCenter(geom: GeoGeometry): {
  lat: number;
  lng: number;
} {
  return centroidOf(geom);
}
