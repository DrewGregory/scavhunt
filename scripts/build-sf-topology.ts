/**
 * Fetch DataSF "SF Find Neighborhoods" (gfpk-269f), merge all 117 source
 * polygons into curated gap-free zones via data/sf-merge-map.json, build a
 * shared-arc topology, self-test coverage, and write data/sf-topology.json.
 *
 * Usage: pnpm tsx scripts/build-sf-topology.ts
 */
import fs from "fs";
import path from "path";
import * as topojson from "topojson-server";
import type { Topology } from "topojson-specification";
import polygonClipping from "polygon-clipping";

const SOURCE_URL =
  "https://data.sf.gov/resource/gfpk-269f.geojson?$limit=300";

const MERGE_INTO: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "sf-merge-map.json"), "utf8"),
);

const ISLAND_ZONES = new Set(["Treasure Island"]);

type Position = [number, number];
type Ring = Position[];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];

type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: PolygonCoords | MultiPolygonCoords;
};

type Feature = {
  type: "Feature";
  properties: { name?: string };
  geometry: Geometry | null;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

type ZoneFeature = {
  type: "Feature";
  properties: { name: string; isIsland: boolean };
  geometry: Geometry;
};

function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function roundGeometry(geom: Geometry): Geometry {
  if (geom.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: (geom.coordinates as PolygonCoords).map((ring) =>
        ring.map((p) => [roundCoord(p[0]), roundCoord(p[1])] as Position),
      ),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: (geom.coordinates as MultiPolygonCoords).map((poly) =>
      poly.map((ring) =>
        ring.map((p) => [roundCoord(p[0]), roundCoord(p[1])] as Position),
      ),
    ),
  };
}

function toClipping(geom: Geometry): polygonClipping.Geom {
  return geom.coordinates as unknown as polygonClipping.Geom;
}

function fromClipping(merged: polygonClipping.Geom): Geometry {
  const coords = merged as MultiPolygonCoords;
  if (coords.length === 1) {
    return { type: "Polygon", coordinates: coords[0] };
  }
  return { type: "MultiPolygon", coordinates: coords };
}

function inRing(x: number, y: number, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0];
    const yi = r[i][1];
    const xj = r[j][0];
    const yj = r[j][1];
    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function inPoly(x: number, y: number, c: PolygonCoords): boolean {
  if (!c[0] || !inRing(x, y, c[0])) return false;
  for (let h = 1; h < c.length; h++) {
    if (inRing(x, y, c[h])) return false;
  }
  return true;
}

function inGeom(x: number, y: number, g: Geometry): boolean {
  if (g.type === "Polygon") return inPoly(x, y, g.coordinates as PolygonCoords);
  return (g.coordinates as MultiPolygonCoords).some((p) => inPoly(x, y, p));
}

function centroidOf(geom: Geometry): { lat: number; lng: number } {
  const rings: Ring[] =
    geom.type === "Polygon"
      ? [(geom.coordinates as PolygonCoords)[0]]
      : (geom.coordinates as MultiPolygonCoords).map((poly) => poly[0]);

  let best = { lat: 0, lng: 0, area: -1 };
  for (const ring of rings) {
    if (!ring?.length) continue;
    const n =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
        ? ring.length - 1
        : ring.length;
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
    const area = Math.abs(twiceArea / 2);
    if (area > best.area && Math.abs(twiceArea) >= 1e-12) {
      best = {
        lng: roundCoord(cx / (3 * twiceArea)),
        lat: roundCoord(cy / (3 * twiceArea)),
        area,
      };
    }
  }
  return { lat: best.lat, lng: best.lng };
}

function decodeArcs(topology: Topology): Position[][] {
  const raw = topology.arcs as number[][][];
  const transform = topology.transform;
  return raw.map((arc) => {
    const abs: Position[] = [];
    let x = 0;
    let y = 0;
    for (const point of arc) {
      x += point[0];
      y += point[1];
      if (transform) {
        abs.push([
          roundCoord(x * transform.scale[0] + transform.translate[0]),
          roundCoord(y * transform.scale[1] + transform.translate[1]),
        ]);
      } else {
        abs.push([roundCoord(x), roundCoord(y)]);
      }
    }
    return abs;
  });
}

type ArcGeom = {
  type: string;
  arcs?: number[][] | number[][][] | number[][][][];
  geometries?: ArcGeom[];
};

function findLockedArcs(topology: Topology, zoneNames: string[]): number[] {
  const usage = new Map<number, number>();
  const objects = topology.objects as Record<string, ArcGeom>;

  for (const name of zoneNames) {
    const obj = objects[name];
    if (!obj) continue;
    const geom = obj.type === "GeometryCollection" ? obj.geometries?.[0] : obj;
    if (!geom?.arcs) continue;

    let polygons: number[][][] = [];
    if (geom.type === "Polygon") {
      polygons = [geom.arcs as number[][]];
    } else if (geom.type === "MultiPolygon") {
      polygons = geom.arcs as number[][][];
    }

    for (const poly of polygons) {
      for (const signed of poly[0] ?? []) {
        const abs = Math.abs(signed);
        usage.set(abs, (usage.get(abs) ?? 0) + 1);
      }
    }
  }

  return [...usage.entries()]
    .filter(([, count]) => count === 1)
    .map(([idx]) => idx)
    .sort((a, b) => a - b);
}

async function main() {
  console.log(`Fetching ${SOURCE_URL}…`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`DataSF fetch failed: ${res.status} ${res.statusText}`);
  }
  const collection = (await res.json()) as FeatureCollection;
  console.log(`Got ${collection.features.length} source features`);

  const bySource = new Map<string, Feature>();
  for (const f of collection.features) {
    const name = f.properties?.name;
    if (name && f.geometry) bySource.set(name, f);
  }

  const unmapped = [...bySource.keys()]
    .filter((n) => !MERGE_INTO[n])
    .sort();
  const missing = Object.keys(MERGE_INTO)
    .filter((n) => !bySource.has(n))
    .sort();

  if (unmapped.length || missing.length) {
    if (unmapped.length) console.warn("Unmapped:", unmapped.join(", "));
    if (missing.length) console.warn("Missing:", missing.join(", "));
    throw new Error(
      `Merge map incomplete: ${unmapped.length} unmapped, ${missing.length} missing`,
    );
  }

  const groups = new Map<string, Geometry[]>();
  for (const [sourceName, zoneName] of Object.entries(MERGE_INTO)) {
    const f = bySource.get(sourceName);
    if (!f?.geometry) continue;
    const list = groups.get(zoneName) ?? [];
    list.push(roundGeometry(f.geometry));
    groups.set(zoneName, list);
  }

  const zoneFeatures: ZoneFeature[] = [];
  for (const [name, geoms] of [...groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    let merged: Geometry = geoms[0];
    for (let i = 1; i < geoms.length; i++) {
      const result = polygonClipping.union(
        toClipping(merged),
        toClipping(geoms[i]),
      );
      merged = fromClipping(result);
    }
    merged = roundGeometry(merged);
    zoneFeatures.push({
      type: "Feature",
      properties: { name, isIsland: ISLAND_ZONES.has(name) },
      geometry: merged,
    });
  }

  console.log(`Merged into ${zoneFeatures.length} curated zones`);

  const named: Record<string, ZoneFeature> = {};
  for (const f of zoneFeatures) named[f.properties.name] = f;

  const topology = topojson.topology(named, 1e5) as Topology;
  const absoluteArcs = decodeArcs(topology);
  const lockedArcs = findLockedArcs(
    topology,
    zoneFeatures.map((f) => f.properties.name),
  );

  const objects: Record<
    string,
    {
      type: "Polygon" | "MultiPolygon";
      arcs: number[][] | number[][][];
      isIsland: boolean;
    }
  > = {};

  for (const f of zoneFeatures) {
    const name = f.properties.name;
    const obj = topology.objects[name] as {
      type: "Polygon" | "MultiPolygon";
      arcs: number[][] | number[][][];
    };
    if (!obj?.arcs) {
      console.warn(`No topology object for ${name}`);
      continue;
    }
    objects[name] = {
      type: obj.type,
      arcs: obj.arcs,
      isIsland: f.properties.isIsland,
    };
  }

  // Coverage self-test over mainland SF
  const step = 0.0012;
  const lngs: number[] = [];
  const lats: number[] = [];
  for (let v = -122.515; v <= -122.355; v += step) lngs.push(v);
  for (let v = 37.708; v <= 37.832; v += step) lats.push(v);

  const geometries = zoneFeatures.map((f) => f.geometry);
  const W = lngs.length;
  const H = lats.length;
  const grid = lngs.map((lng) =>
    lats.map((lat) => (geometries.some((g) => inGeom(lng, lat, g)) ? 1 : 0)),
  );

  const seen = Array.from({ length: W }, () => new Array(H).fill(false));
  const q: Array<[number, number]> = [];
  for (let i = 0; i < W; i++) {
    for (const j of [0, H - 1]) {
      if (!grid[i][j] && !seen[i][j]) {
        seen[i][j] = true;
        q.push([i, j]);
      }
    }
  }
  for (let j = 0; j < H; j++) {
    for (const i of [0, W - 1]) {
      if (!grid[i][j] && !seen[i][j]) {
        seen[i][j] = true;
        q.push([i, j]);
      }
    }
  }
  while (q.length) {
    const [i, j] = q.pop()!;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= W || b >= H) continue;
      if (grid[a][b] || seen[a][b]) continue;
      seen[a][b] = true;
      q.push([a, b]);
    }
  }

  let covered = 0;
  let holes = 0;
  const holePts: Array<[number, number]> = [];
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) {
      if (grid[i][j]) covered += 1;
      else if (!seen[i][j]) {
        holes += 1;
        if (holePts.length < 15) {
          holePts.push([+lngs[i].toFixed(4), +lats[j].toFixed(4)]);
        }
      }
    }
  }

  console.log(
    `Coverage grid ${W}x${H}: covered=${covered}, interior gaps=${holes}`,
  );
  if (holePts.length) {
    console.warn("Gap examples:", JSON.stringify(holePts));
  }
  if (holes > 30) {
    throw new Error(
      `Too many interior gaps (${holes}) — merge map may be incomplete`,
    );
  }

  const neighborhoods = zoneFeatures.map((f) => {
    const { lat, lng } = centroidOf(f.geometry);
    return {
      name: f.properties.name,
      isIsland: f.properties.isIsland,
      geometry: f.geometry,
      centerLat: lat,
      centerLng: lng,
    };
  });

  const out = {
    version: 1,
    transform: topology.transform ?? null,
    arcs: absoluteArcs,
    objectsByName: objects,
    lockedArcs,
    neighborhoods,
    meta: {
      sourceCount: collection.features.length,
      zoneCount: zoneFeatures.length,
      arcCount: absoluteArcs.length,
      lockedArcCount: lockedArcs.length,
      coverageGaps: holes,
      builtAt: new Date().toISOString(),
    },
  };

  const dest = path.join(__dirname, "..", "data", "sf-topology.json");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(
    `Wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB, ${zoneFeatures.length} zones, ${absoluteArcs.length} arcs, ${lockedArcs.length} locked)`,
  );

  const flatDest = path.join(__dirname, "..", "data", "sf-neighborhoods.json");
  fs.writeFileSync(flatDest, JSON.stringify(neighborhoods));
  console.log(`Also wrote ${flatDest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
