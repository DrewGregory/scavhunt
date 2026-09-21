/**
 * Shared-arc topology helpers for gap-free SF neighborhood boundaries.
 *
 * Arcs are absolute [lng, lat] polylines. Zone objects reference rings of
 * signed arc indices (TopoJSON convention: ~i = reverse of arc i).
 */
import type { GeoGeometry, Position } from "./geo";
import { centroidOf } from "./geo";

export type Arc = Position[];

export type ZoneObject = {
  type: "Polygon" | "MultiPolygon";
  /** Polygon: number[][] (rings). MultiPolygon: number[][][] (polygons → rings). */
  arcs: number[][] | number[][][];
  isIsland?: boolean;
};

export type TopologyData = {
  arcs: Arc[];
  /** Keyed by neighborhood id (runtime) or name (seed file). */
  objects: Record<string, ZoneObject>;
  lockedArcs: number[];
  version?: number;
};

/** Shape of data/sf-topology.json written by scripts/build-sf-topology.ts */
export type TopologyFile = {
  version: number;
  transform?: unknown;
  arcs: Arc[];
  objectsByName: Record<string, ZoneObject>;
  lockedArcs: number[];
  neighborhoods: Array<{
    name: string;
    isIsland: boolean;
    geometry: GeoGeometry;
    centerLat: number;
    centerLng: number;
  }>;
  meta?: Record<string, unknown>;
};

export function absArcIndex(signed: number): number {
  return signed < 0 ? ~signed : signed;
}

function reverseArc(arc: Arc): Arc {
  return [...arc].reverse();
}

export function resolveArc(arcs: Arc[], signed: number): Arc {
  if (signed < 0) {
    const arc = arcs[~signed];
    return arc ? reverseArc(arc) : [];
  }
  return arcs[signed] ?? [];
}

export function ringFromArcs(arcs: Arc[], signedIndices: number[]): Position[] {
  const ring: Position[] = [];
  for (const signed of signedIndices) {
    const pts = resolveArc(arcs, signed);
    for (let i = 0; i < pts.length; i++) {
      if (i === 0 && ring.length > 0) continue;
      ring.push(pts[i]);
    }
  }
  if (
    ring.length > 1 &&
    (ring[0][0] !== ring[ring.length - 1][0] ||
      ring[0][1] !== ring[ring.length - 1][1])
  ) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return ring;
}

export function geometryFromObject(arcs: Arc[], obj: ZoneObject): GeoGeometry {
  if (obj.type === "Polygon") {
    const rings = (obj.arcs as number[][]).map((r) => ringFromArcs(arcs, r));
    return { type: "Polygon", coordinates: rings };
  }
  const polygons = (obj.arcs as number[][][]).map((poly) =>
    poly.map((r) => ringFromArcs(arcs, r)),
  );
  return { type: "MultiPolygon", coordinates: polygons };
}

export function arcIndicesForObject(obj: ZoneObject): number[] {
  const out = new Set<number>();
  const visit = (signed: number) => {
    out.add(absArcIndex(signed));
  };
  if (obj.type === "Polygon") {
    for (const ring of obj.arcs as number[][]) {
      for (const s of ring) visit(s);
    }
  } else {
    for (const poly of obj.arcs as number[][][]) {
      for (const ring of poly) {
        for (const s of ring) visit(s);
      }
    }
  }
  return Array.from(out);
}

export function neighborsSharingArcs(
  objects: Record<string, ZoneObject>,
  arcIndices: number[],
): string[] {
  const want = new Set(arcIndices);
  const hits: string[] = [];
  for (const [id, obj] of Object.entries(objects)) {
    if (arcIndicesForObject(obj).some((i) => want.has(i))) hits.push(id);
  }
  return hits;
}

function almostEqual(a: Position, b: Position, eps = 1e-9): boolean {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
}

function orient(a: Position, b: Position, c: Position): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Position, b: Position, c: Position): boolean {
  return (
    Math.min(a[0], b[0]) - 1e-12 <= c[0] &&
    c[0] <= Math.max(a[0], b[0]) + 1e-12 &&
    Math.min(a[1], b[1]) - 1e-12 <= c[1] &&
    c[1] <= Math.max(a[1], b[1]) + 1e-12
  );
}

function segmentsIntersect(
  p1: Position,
  q1: Position,
  p2: Position,
  q2: Position,
): boolean {
  if (
    almostEqual(p1, p2) ||
    almostEqual(p1, q2) ||
    almostEqual(q1, p2) ||
    almostEqual(q1, q2)
  ) {
    return false;
  }
  const o1 = orient(p1, q1, p2);
  const o2 = orient(p1, q1, q2);
  const o3 = orient(p2, q2, p1);
  const o4 = orient(p2, q2, q1);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) < 1e-12 && onSegment(p1, q1, p2)) return true;
  if (Math.abs(o2) < 1e-12 && onSegment(p1, q1, q2)) return true;
  if (Math.abs(o3) < 1e-12 && onSegment(p2, q2, p1)) return true;
  if (Math.abs(o4) < 1e-12 && onSegment(p2, q2, q1)) return true;
  return false;
}

export function isSimplePolyline(pts: Position[]): boolean {
  if (pts.length < 4) return true;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      if (i === 0 && j === pts.length - 2) continue;
      if (segmentsIntersect(pts[i], pts[i + 1], pts[j], pts[j + 1])) {
        return false;
      }
    }
  }
  return true;
}

export function isSimpleRing(ring: Position[]): boolean {
  if (ring.length < 4) return false;
  const pts = almostEqual(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : ring;
  if (pts.length < 3) return false;
  for (let i = 0; i < pts.length; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % pts.length];
    for (let j = i + 1; j < pts.length; j++) {
      if ((j + 1) % pts.length === i) continue;
      if ((i + 1) % pts.length === j) continue;
      const b1 = pts[j];
      const b2 = pts[(j + 1) % pts.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

function ringArea(ring: Position[]): number {
  const n =
    ring.length > 1 && almostEqual(ring[0], ring[ring.length - 1])
      ? ring.length - 1
      : ring.length;
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    twice += x0 * y1 - x1 * y0;
  }
  return Math.abs(twice / 2);
}

export type ArcEditValidation =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Soft-fix endpoints: Geoman often nudges junctions slightly while dragging
 * nearby vertices. Snap them back to the stored junctions instead of rejecting.
 */
export function snapArcEndpoints(
  original: Position[],
  edited: Position[],
): Position[] {
  if (edited.length < 2 || original.length < 2) return edited;
  const next = edited.map((p) => [p[0], p[1]] as Position);
  next[0] = [original[0][0], original[0][1]];
  next[next.length - 1] = [
    original[original.length - 1][0],
    original[original.length - 1][1],
  ];
  return next;
}

export function validateArcEdit(
  topology: TopologyData,
  arcIndex: number,
  newPoints: Position[],
  lockedSet: Set<number>,
): ArcEditValidation {
  if (lockedSet.has(arcIndex)) {
    return {
      ok: false,
      error: "That edge is shoreline and can't be moved",
    };
  }
  if (newPoints.length < 2) {
    return { ok: false, error: "Edge needs at least 2 points" };
  }

  const old = topology.arcs[arcIndex];
  if (!old || old.length < 2) {
    return { ok: false, error: "Unknown edge" };
  }

  // Endpoints are snap-corrected by the caller / API — don't hard-fail here.
  const points = snapArcEndpoints(old, newPoints);

  if (!isSimplePolyline(points)) {
    return { ok: false, error: "That edit would cross itself" };
  }

  const trialArcs = topology.arcs.map((a, i) =>
    i === arcIndex ? points : a,
  );
  const affected = neighborsSharingArcs(topology.objects, [arcIndex]);
  if (affected.length === 0) {
    return { ok: false, error: "Edge isn't used by any neighborhood" };
  }

  const otherArcIdx = new Set<number>();
  for (const id of affected) {
    for (const idx of arcIndicesForObject(topology.objects[id])) {
      if (idx !== arcIndex) otherArcIdx.add(idx);
    }
  }

  for (const idx of Array.from(otherArcIdx)) {
    const other = trialArcs[idx];
    if (!other) continue;
    for (let i = 0; i < points.length - 1; i++) {
      for (let j = 0; j < other.length - 1; j++) {
        if (
          segmentsIntersect(
            points[i],
            points[i + 1],
            other[j],
            other[j + 1],
          )
        ) {
          return {
            ok: false,
            error: "That edit would cross another neighborhood border",
          };
        }
      }
    }
  }

  for (const id of affected) {
    const obj = topology.objects[id];
    if (!obj) continue;
    const geom = geometryFromObject(trialArcs, obj);
    const isIsland = Boolean(obj.isIsland);

    if (geom.type === "Polygon") {
      const outer = geom.coordinates[0];
      if (!outer || ringArea(outer) < 1e-14) {
        return { ok: false, error: "That edit would collapse a neighborhood" };
      }
      if (!isSimpleRing(outer)) {
        return {
          ok: false,
          error: "That edit would twist a neighborhood shape",
        };
      }
    } else {
      if (!isIsland && geom.coordinates.length > 1) {
        return {
          ok: false,
          error: "Mainland neighborhoods can't be split into islands",
        };
      }
      for (const poly of geom.coordinates) {
        const outer = poly[0];
        if (!outer || ringArea(outer) < 1e-14) {
          return { ok: false, error: "That edit would collapse a neighborhood" };
        }
        if (!isSimpleRing(outer)) {
          return {
            ok: false,
            error: "That edit would twist a neighborhood shape",
          };
        }
      }
    }
  }

  return { ok: true };
}

export function rebuildAffectedZones(
  topology: TopologyData,
  arcIndex: number,
): Array<{
  neighborhoodId: string;
  geometry: GeoGeometry;
  center: { lat: number; lng: number };
}> {
  const affected = neighborsSharingArcs(topology.objects, [arcIndex]);
  return affected.map((id) => {
    const geom = geometryFromObject(topology.arcs, topology.objects[id]);
    return {
      neighborhoodId: id,
      geometry: geom,
      center: centroidOf(geom),
    };
  });
}

export function applyArcEdit(
  topology: TopologyData,
  arcIndex: number,
  newPoints: Position[],
): TopologyData {
  const old = topology.arcs[arcIndex];
  const points =
    old && old.length >= 2 ? snapArcEndpoints(old, newPoints) : newPoints;
  return {
    ...topology,
    arcs: topology.arcs.map((a, i) => (i === arcIndex ? points : a)),
  };
}
