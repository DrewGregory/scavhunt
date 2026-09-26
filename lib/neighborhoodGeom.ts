import polygonClipping from "polygon-clipping";
import type { GeoGeometry, Position } from "./geo";
import { bboxOf, centroidOf } from "./geo";

type ClippingGeom = polygonClipping.Geom;

function toClipping(geom: GeoGeometry): ClippingGeom {
  return geom.coordinates as unknown as ClippingGeom;
}

function fromClipping(merged: ClippingGeom): GeoGeometry | null {
  if (!merged || merged.length === 0) return null;
  const coords = merged as Position[][][];
  if (coords.length === 1) {
    return { type: "Polygon", coordinates: coords[0] };
  }
  return { type: "MultiPolygon", coordinates: coords };
}

function roundCoord(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function roundGeometry(geom: GeoGeometry): GeoGeometry {
  if (geom.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geom.coordinates.map((ring) =>
        ring.map((p) => [roundCoord(p[0]), roundCoord(p[1])] as Position),
      ),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: geom.coordinates.map((poly) =>
      poly.map((ring) =>
        ring.map((p) => [roundCoord(p[0]), roundCoord(p[1])] as Position),
      ),
    ),
  };
}

/** Union several neighborhood polygons into one. */
export function unionGeometries(geoms: GeoGeometry[]): GeoGeometry | null {
  if (geoms.length === 0) return null;
  let acc: ClippingGeom = toClipping(geoms[0]!);
  for (let i = 1; i < geoms.length; i++) {
    acc = polygonClipping.union(acc, toClipping(geoms[i]!));
  }
  const out = fromClipping(acc);
  return out ? roundGeometry(out) : null;
}

/**
 * Split a geometry with a vertical cut at `cutLng`.
 * Returns west (lng <= cut) and east (lng >= cut) pieces.
 */
export function splitGeometryVertical(
  geom: GeoGeometry,
  cutLng: number,
): { west: GeoGeometry; east: GeoGeometry } | { error: string } {
  const bb = bboxOf(geom);
  if (!(cutLng > bb.minLng && cutLng < bb.maxLng)) {
    return { error: "Cut line must fall inside the neighborhood" };
  }
  const pad = 0.02;
  const westRect: GeoGeometry = {
    type: "Polygon",
    coordinates: [
      [
        [bb.minLng - pad, bb.minLat - pad],
        [cutLng, bb.minLat - pad],
        [cutLng, bb.maxLat + pad],
        [bb.minLng - pad, bb.maxLat + pad],
        [bb.minLng - pad, bb.minLat - pad],
      ],
    ],
  };
  const eastRect: GeoGeometry = {
    type: "Polygon",
    coordinates: [
      [
        [cutLng, bb.minLat - pad],
        [bb.maxLng + pad, bb.minLat - pad],
        [bb.maxLng + pad, bb.maxLat + pad],
        [cutLng, bb.maxLat + pad],
        [cutLng, bb.minLat - pad],
      ],
    ],
  };

  const westRaw = fromClipping(
    polygonClipping.intersection(toClipping(geom), toClipping(westRect)),
  );
  const eastRaw = fromClipping(
    polygonClipping.intersection(toClipping(geom), toClipping(eastRect)),
  );
  if (!westRaw || !eastRaw) {
    return { error: "Split produced an empty piece — move the cut line" };
  }
  return {
    west: roundGeometry(westRaw),
    east: roundGeometry(eastRaw),
  };
}

export function geometryCenter(geom: GeoGeometry): {
  lat: number;
  lng: number;
} {
  return centroidOf(geom);
}
