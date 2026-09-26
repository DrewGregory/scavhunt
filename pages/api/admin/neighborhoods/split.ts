import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../../lib/auth";
import { parseJsonBody } from "../../../../lib/serialize";
import { jsonError } from "../../../../lib/http";
import type { GeoGeometry } from "../../../../lib/geo";
import {
  geometryCenter,
  splitGeometryVertical,
} from "../../../../lib/neighborhoodGeom";
import { rebuildMapTopologyFromDb } from "../../../../lib/rebuildMapTopology";

const schema = z.object({
  id: z.string().min(1),
  /** Longitude of the vertical cut. West keeps the original; east becomes "{Name} Child". */
  cutLng: z.number().finite(),
});

async function uniqueChildName(base: string): Promise<string> {
  const preferred = `${base} Child`;
  const existing = await prisma.neighborhood.findMany({
    where: {
      OR: [
        { name: preferred },
        { name: { startsWith: `${preferred} ` } },
      ],
    },
    select: { name: true },
  });
  const taken = new Set(existing.map((e) => e.name));
  if (!taken.has(preferred)) return preferred;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${preferred} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${preferred} ${Date.now()}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  const parsed = schema.safeParse(parseJsonBody(req.body));
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const { id, cutLng } = parsed.data;
  const row = await prisma.neighborhood.findFirst({
    where: { id, deletedAt: null },
  });
  if (!row) {
    return res.status(404).json({ error: "Neighborhood not found" });
  }
  if (!row.boundary || typeof row.boundary !== "object") {
    return res.status(400).json({ error: "Neighborhood has no boundary" });
  }
  const geom = row.boundary as GeoGeometry;
  if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") {
    return res.status(400).json({ error: "Invalid boundary geometry" });
  }

  const split = splitGeometryVertical(geom, cutLng);
  if ("error" in split) {
    return res.status(400).json({ error: split.error });
  }

  const westCenter = geometryCenter(split.west);
  const eastCenter = geometryCenter(split.east);
  const childName = await uniqueChildName(row.name);

  const child = await prisma.$transaction(async (tx) => {
    await tx.neighborhood.update({
      where: { id: row.id },
      data: {
        boundary: split.west as unknown as Prisma.InputJsonValue,
        centerLat: westCenter.lat,
        centerLng: westCenter.lng,
      },
    });

    return tx.neighborhood.create({
      data: {
        name: childName,
        emoji: row.emoji,
        onMap: true,
        isIsland: false,
        boundary: split.east as unknown as Prisma.InputJsonValue,
        centerLat: eastCenter.lat,
        centerLng: eastCenter.lng,
      },
    });
  });

  const topo = await rebuildMapTopologyFromDb();

  return res.status(200).json({
    ok: true,
    originalId: row.id,
    childId: child.id,
    childName: child.name,
    topologyRebuilt: topo.ok,
    topologyError: topo.ok ? undefined : topo.error,
  });
}
