/**
 * Fetch all DataSF "SF Find Neighborhoods" polygons (gfpk-269f, ~117 zones)
 * and write data/sf-datasf-117.json for admin import.
 *
 * This does NOT merge or build shared-arc topology — it's the raw breakup.
 * The curated gap-free seed remains data/sf-topology.json.
 *
 * Usage: pnpm datasf:build
 */
import fs from "fs";
import path from "path";

const SOURCE_URL =
  "https://data.sf.gov/resource/gfpk-269f.geojson?$limit=300";

type Position = [number, number];
type Ring = Position[];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];
type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: PolygonCoords | MultiPolygonCoords;
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
  if (best.area < 0) {
    const ring = rings[0];
    const mid = ring[Math.floor(ring.length / 2)];
    return { lat: roundCoord(mid[1]), lng: roundCoord(mid[0]) };
  }
  return { lat: best.lat, lng: best.lng };
}

async function main() {
  console.log(`Fetching ${SOURCE_URL}…`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const collection = (await res.json()) as {
    type: string;
    features: Array<{
      type: string;
      properties?: { name?: string };
      geometry?: Geometry | null;
    }>;
  };

  const neighborhoods: Array<{
    name: string;
    isIsland: boolean;
    geometry: Geometry;
    centerLat: number;
    centerLng: number;
  }> = [];

  for (const f of collection.features) {
    const name = f.properties?.name?.trim();
    if (!name || !f.geometry) continue;
    if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") {
      continue;
    }
    const geometry = roundGeometry(f.geometry);
    const { lat, lng } = centroidOf(geometry);
    neighborhoods.push({
      name,
      isIsland: /treasure island/i.test(name),
      geometry,
      centerLat: lat,
      centerLng: lng,
    });
  }

  neighborhoods.sort((a, b) => a.name.localeCompare(b.name));

  const out = {
    version: 1,
    source: "datasf-gfpk-269f",
    sourceUrl: SOURCE_URL,
    neighborhoods,
    meta: {
      zoneCount: neighborhoods.length,
      builtAt: new Date().toISOString(),
      note: "Raw DataSF neighborhoods — not gap-free; no shared-arc topology.",
    },
  };

  const dest = path.join(__dirname, "..", "data", "sf-datasf-117.json");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(
    `Wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB, ${neighborhoods.length} zones)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
