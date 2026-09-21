/**
 * Import data/sf-topology.json into the local DB and run coverage + arc-edit checks.
 * Usage: pnpm tsx scripts/verify-sf-topology.ts
 */
import fs from "fs";
import path from "path";
import { Prisma, PrismaClient } from "@prisma/client";
import { validateBoundary } from "../lib/geo";
import type { Position } from "../lib/geo";
import {
  applyArcEdit,
  geometryFromObject,
  neighborsSharingArcs,
  rebuildAffectedZones,
  validateArcEdit,
  type TopologyFile,
  type ZoneObject,
} from "../lib/topology";

const prisma = new PrismaClient();

function inRing(x: number, y: number, r: number[][]): boolean {
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

function inPoly(x: number, y: number, c: number[][][]): boolean {
  if (!c[0] || !inRing(x, y, c[0])) return false;
  for (let h = 1; h < c.length; h++) {
    if (inRing(x, y, c[h])) return false;
  }
  return true;
}

function inGeom(x: number, y: number, g: any): boolean {
  if (!g) return false;
  if (g.type === "Polygon") return inPoly(x, y, g.coordinates);
  return g.coordinates.some((p: number[][][]) => inPoly(x, y, p));
}

async function main() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "sf-topology.json"), "utf8"),
  ) as TopologyFile;

  let created = 0;
  let updated = 0;
  const objectsById: Record<string, ZoneObject> = {};
  const imported = new Set<string>();

  for (const item of raw.neighborhoods) {
    const zoneObj = raw.objectsByName[item.name];
    const fromArcs = zoneObj
      ? geometryFromObject(raw.arcs, zoneObj)
      : item.geometry;
    const validated = validateBoundary(fromArcs);
    if (!validated.ok) {
      console.warn("skip", item.name, validated.error);
      continue;
    }
    imported.add(item.name);
    const existing = await prisma.neighborhood.findUnique({
      where: { name: item.name },
    });
    const data = {
      boundary: validated.geometry as unknown as Prisma.InputJsonValue,
      centerLat: item.centerLat ?? validated.center.lat,
      centerLng: item.centerLng ?? validated.center.lng,
      onMap: true,
      isIsland: Boolean(item.isIsland),
    };
    let id: string;
    if (existing) {
      await prisma.neighborhood.update({ where: { id: existing.id }, data });
      id = existing.id;
      updated += 1;
    } else {
      const row = await prisma.neighborhood.create({
        data: { name: item.name, ...data },
      });
      id = row.id;
      created += 1;
    }
    if (zoneObj) objectsById[id] = { ...zoneObj, isIsland: data.isIsland };
  }

  // Drop leftover names from earlier imports off the player map.
  const demoted = await prisma.neighborhood.updateMany({
    where: {
      onMap: true,
      name: { notIn: Array.from(imported) },
    },
    data: { onMap: false },
  });

  await prisma.mapTopology.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      transform: (raw.transform ?? Prisma.DbNull) as Prisma.InputJsonValue,
      arcs: raw.arcs as unknown as Prisma.InputJsonValue,
      objects: objectsById as unknown as Prisma.InputJsonValue,
      lockedArcs: raw.lockedArcs as unknown as Prisma.InputJsonValue,
      version: 1,
    },
    update: {
      transform: (raw.transform ?? Prisma.DbNull) as Prisma.InputJsonValue,
      arcs: raw.arcs as unknown as Prisma.InputJsonValue,
      objects: objectsById as unknown as Prisma.InputJsonValue,
      lockedArcs: raw.lockedArcs as unknown as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });

  console.log({
    created,
    updated,
    demoted: demoted.count,
    zones: imported.size,
    arcs: raw.arcs.length,
  });

  const neighborhoods = await prisma.neighborhood.findMany({
    where: { onMap: true, NOT: { boundary: { equals: Prisma.DbNull } } },
    select: { name: true, boundary: true },
  });

  const step = 0.0012;
  const lngs: number[] = [];
  const lats: number[] = [];
  for (let v = -122.515; v <= -122.355; v += step) lngs.push(v);
  for (let v = 37.708; v <= 37.832; v += step) lats.push(v);
  const geoms = neighborhoods.map((n) => n.boundary as any);
  const W = lngs.length;
  const H = lats.length;
  const grid = lngs.map((lng) =>
    lats.map((lat) => (geoms.some((g) => inGeom(lng, lat, g)) ? 1 : 0)),
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
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) {
      if (grid[i][j]) covered += 1;
      else if (!seen[i][j]) holes += 1;
    }
  }
  console.log({
    covered,
    interiorGaps: holes,
    neighborhoodCount: neighborhoods.length,
  });
  if (holes > 30) {
    throw new Error(`Too many interior gaps: ${holes}`);
  }

  const topo = await prisma.mapTopology.findUniqueOrThrow({
    where: { id: "default" },
  });
  const arcs = topo.arcs as Position[][];
  const objects = topo.objects as Record<string, ZoneObject>;
  const locked = new Set(topo.lockedArcs as number[]);

  let target = -1;
  for (let i = 0; i < arcs.length; i++) {
    if (locked.has(i)) continue;
    if ((arcs[i]?.length ?? 0) < 3) continue;
    const owners = neighborsSharingArcs(objects, [i]);
    if (owners.length >= 2) {
      target = i;
      break;
    }
  }
  if (target < 0) throw new Error("No editable shared arc found");

  const orig = arcs[target];
  const mid = Math.floor(orig.length / 2);
  const nudged: Position[] = orig.map((p, idx) =>
    idx === mid ? [p[0] + 0.00005, p[1] + 0.00005] : p,
  );

  const topologyData = {
    arcs,
    objects,
    lockedArcs: [...locked],
    version: topo.version,
  };
  const validation = validateArcEdit(topologyData, target, nudged, locked);
  console.log({ editableArc: target, validation });
  if (!validation.ok) {
    throw new Error(`Arc validation failed: ${validation.error}`);
  }

  const next = applyArcEdit(topologyData, target, nudged);
  const rebuilt = rebuildAffectedZones(next, target);
  console.log({
    rebuiltCount: rebuilt.length,
    ids: rebuilt.map((z) => z.neighborhoodId),
  });
  if (rebuilt.length < 2) {
    throw new Error("Expected at least 2 zones to rebuild from a shared arc");
  }
  console.log("verify-sf-topology: OK");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
