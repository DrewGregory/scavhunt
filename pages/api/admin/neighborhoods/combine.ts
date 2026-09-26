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
  unionGeometries,
} from "../../../../lib/neighborhoodGeom";
import { rebuildMapTopologyFromDb } from "../../../../lib/rebuildMapTopology";

const schema = z.object({
  /** First id is the survivor (keeps name + receives deposits). */
  ids: z.array(z.string().min(1)).min(2),
});

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
    return res.status(400).json({ error: "Invalid body — need ids: string[]" });
  }

  const ids = [...new Set(parsed.data.ids)];
  if (ids.length < 2) {
    return res.status(400).json({ error: "Select at least two neighborhoods" });
  }

  const rows = await prisma.neighborhood.findMany({
    where: { id: { in: ids }, deletedAt: null },
  });
  if (rows.length !== ids.length) {
    return res.status(404).json({ error: "One or more neighborhoods not found" });
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)!);
  const survivor = ordered[0]!;
  const absorbed = ordered.slice(1);

  const geoms: GeoGeometry[] = [];
  for (const n of ordered) {
    if (!n.boundary || typeof n.boundary !== "object") {
      return res.status(400).json({
        error: `${n.name} has no boundary — can't combine`,
      });
    }
    const g = n.boundary as GeoGeometry;
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") {
      return res.status(400).json({ error: `${n.name} has invalid boundary` });
    }
    geoms.push(g);
  }

  const unioned = unionGeometries(geoms);
  if (!unioned) {
    return res.status(400).json({ error: "Union produced an empty geometry" });
  }
  const center = geometryCenter(unioned);
  const absorbedIds = absorbed.map((a) => a.id);

  await prisma.$transaction(async (tx) => {
    await tx.neighborhoodDeposit.updateMany({
      where: { neighborhoodId: { in: absorbedIds }, deletedAt: null },
      data: { neighborhoodId: survivor.id },
    });

    await tx.neighborhood.update({
      where: { id: survivor.id },
      data: {
        boundary: unioned as unknown as Prisma.InputJsonValue,
        centerLat: center.lat,
        centerLng: center.lng,
        onMap: true,
      },
    });

    await tx.neighborhood.updateMany({
      where: { id: { in: absorbedIds } },
      data: {
        deletedAt: new Date(),
        onMap: false,
        boundary: Prisma.DbNull,
        centerLat: null,
        centerLng: null,
      },
    });
  });

  const topo = await rebuildMapTopologyFromDb();

  return res.status(200).json({
    ok: true,
    survivorId: survivor.id,
    survivorName: survivor.name,
    absorbedIds,
    topologyRebuilt: topo.ok,
    topologyError: topo.ok ? undefined : topo.error,
  });
}
