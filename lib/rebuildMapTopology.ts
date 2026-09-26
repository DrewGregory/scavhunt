/**
 * Rebuild MapTopology from current on-map neighborhood polygons so shared-edge
 * editing still works after combine/split.
 */
import { Prisma } from "@prisma/client";
import * as topojson from "topojson-server";
import type { Topology } from "topojson-specification";
import type { GeoGeometry, Position } from "./geo";
import type { ZoneObject } from "./topology";
import { prisma } from "./prisma";

function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5;
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

/** Arcs referenced by only one zone ≈ shoreline / outer boundary. */
function findLockedArcs(topology: Topology, ids: string[]): number[] {
  const usage = new Map<number, number>();
  const objects = topology.objects as Record<string, ArcGeom>;

  for (const id of ids) {
    const obj = objects[id];
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

export async function rebuildMapTopologyFromDb(): Promise<{
  ok: true;
  version: number;
} | { ok: false; error: string }> {
  const neighborhoods = await prisma.neighborhood.findMany({
    where: { onMap: true, deletedAt: null },
    select: {
      id: true,
      isIsland: true,
      boundary: true,
    },
  });

  if (neighborhoods.length === 0) {
    await prisma.mapTopology.deleteMany({ where: { id: "default" } });
    return { ok: false, error: "No on-map neighborhoods with boundaries" };
  }

  const named: Record<
    string,
    {
      type: "Feature";
      properties: { id: string };
      geometry: GeoGeometry;
    }
  > = {};

  for (const n of neighborhoods) {
    if (!n.boundary || typeof n.boundary !== "object") continue;
    const g = n.boundary as GeoGeometry;
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;
    named[n.id] = {
      type: "Feature",
      properties: { id: n.id },
      geometry: g,
    };
  }

  const ids = Object.keys(named);
  if (ids.length === 0) {
    return { ok: false, error: "No valid boundary polygons to topologize" };
  }

  try {
    const topology = topojson.topology(named, 1e5) as Topology;
    const absoluteArcs = decodeArcs(topology);
    const lockedArcs = findLockedArcs(topology, ids);

    const objects: Record<string, ZoneObject> = {};
    for (const id of ids) {
      const obj = topology.objects[id] as {
        type: "Polygon" | "MultiPolygon";
        arcs: number[][] | number[][][];
      };
      if (!obj?.arcs) continue;
      const nb = neighborhoods.find((n) => n.id === id);
      objects[id] = {
        type: obj.type,
        arcs: obj.arcs,
        isIsland: nb?.isIsland ?? false,
      };
    }

    const existing = await prisma.mapTopology.findUnique({
      where: { id: "default" },
    });
    const nextVersion = (existing?.version ?? 0) + 1;

    await prisma.mapTopology.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        arcs: absoluteArcs as unknown as Prisma.InputJsonValue,
        objects: objects as unknown as Prisma.InputJsonValue,
        lockedArcs: lockedArcs as unknown as Prisma.InputJsonValue,
        version: nextVersion,
      },
      update: {
        arcs: absoluteArcs as unknown as Prisma.InputJsonValue,
        objects: objects as unknown as Prisma.InputJsonValue,
        lockedArcs: lockedArcs as unknown as Prisma.InputJsonValue,
        version: nextVersion,
      },
    });

    return { ok: true, version: nextVersion };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Topology rebuild failed";
    return { ok: false, error: msg };
  }
}
