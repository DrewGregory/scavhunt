import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";
import type { Position } from "../../../lib/geo";
import type { TopologyData, ZoneObject } from "../../../lib/topology";
import {
  applyArcEdit,
  rebuildAffectedZones,
  snapArcEndpoints,
  validateArcEdit,
} from "../../../lib/topology";

function loadTopology(row: {
  arcs: unknown;
  objects: unknown;
  lockedArcs: unknown;
  version: number;
}): TopologyData {
  return {
    arcs: row.arcs as TopologyData["arcs"],
    objects: row.objects as Record<string, ZoneObject>,
    lockedArcs: row.lockedArcs as number[],
    version: row.version,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const row = await prisma.mapTopology.findUnique({
      where: { id: "default" },
    });
    if (!row) {
      return res.status(404).json({
        error:
          "No topology loaded yet. Import SF boundaries from the Map tab first.",
      });
    }

    const neighborhoods = await prisma.neighborhood.findMany({
      where: { onMap: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        emoji: true,
        isIsland: true,
        centerLat: true,
        centerLng: true,
        boundary: true,
      },
      orderBy: { name: "asc" },
    });

    return res.status(200).json({
      version: row.version,
      arcs: row.arcs,
      objects: row.objects,
      lockedArcs: row.lockedArcs,
      neighborhoods,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  if (req.method === "PATCH") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const schema = z.object({
      arcIndex: z.number().int().nonnegative(),
      points: z.array(z.tuple([z.number(), z.number()])).min(2),
      version: z.number().int().positive(),
    });

    const parsed = schema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const { arcIndex, points, version } = parsed.data;

    const row = await prisma.mapTopology.findUnique({
      where: { id: "default" },
    });
    if (!row) {
      return res.status(404).json({ error: "No topology loaded" });
    }
    if (row.version !== version) {
      // Soft conflict: client will reload silently; keep the message short.
      return res.status(409).json({
        error: "Map changed — refreshing",
        version: row.version,
      });
    }

    const topology = loadTopology(row);
    if (arcIndex >= topology.arcs.length) {
      return res.status(400).json({ error: "arcIndex out of range" });
    }

    const lockedSet = new Set(topology.lockedArcs);
    const original = topology.arcs[arcIndex];
    const snapped = original
      ? snapArcEndpoints(original, points as Position[])
      : (points as Position[]);

    const validation = validateArcEdit(
      topology,
      arcIndex,
      snapped,
      lockedSet,
    );
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const next = applyArcEdit(topology, arcIndex, snapped);
    const rebuilt = rebuildAffectedZones(next, arcIndex);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.mapTopology.updateMany({
          where: { id: "default", version },
          data: {
            arcs: next.arcs as unknown as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new Error("VERSION_CONFLICT");
        }

        for (const zone of rebuilt) {
          await tx.neighborhood.update({
            where: { id: zone.neighborhoodId },
            data: {
              boundary: zone.geometry as unknown as Prisma.InputJsonValue,
              centerLat: zone.center.lat,
              centerLng: zone.center.lng,
            },
          });
        }

        return tx.mapTopology.findUniqueOrThrow({ where: { id: "default" } });
      });

      return res.status(200).json({
        ok: true,
        version: result.version,
        arcs: result.arcs,
        objects: result.objects,
        lockedArcs: result.lockedArcs,
        updatedNeighborhoodIds: rebuilt.map((z) => z.neighborhoodId),
      });
    } catch (e) {
      if (e instanceof Error && e.message === "VERSION_CONFLICT") {
        return res.status(409).json({
          error: "Map changed — refreshing",
        });
      }
      throw e;
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
