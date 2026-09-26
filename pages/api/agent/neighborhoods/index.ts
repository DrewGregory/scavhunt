import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminApiKey, wantsIncludeDeleted } from "../../../../lib/agentAuth";
import { includeDeletedWhere } from "../../../../lib/softDelete";
import { prisma } from "../../../../lib/prisma";
import { parseJsonBody } from "../../../../lib/serialize";
import { neighborhoodEmoji } from "../../../../lib/neighborhoodEmoji";

function serializeNeighborhood(n: {
  id: string;
  name: string;
  emoji: string | null;
  boundary: unknown;
  onMap: boolean;
  isIsland: boolean;
  centerLat: number | null;
  centerLng: number | null;
  createdAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: n.id,
    name: n.name,
    emoji: n.emoji,
    displayEmoji: neighborhoodEmoji(n.name, n.emoji),
    onMap: n.onMap,
    isIsland: n.isIsland,
    centerLat: n.centerLat,
    centerLng: n.centerLng,
    hasBoundary: n.boundary != null,
    createdAt: n.createdAt.toISOString(),
    deletedAt: n.deletedAt?.toISOString() ?? null,
  };
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emoji: z.string().trim().max(16).optional().nullable(),
  onMap: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  if (req.method === "GET") {
    const neighborhoods = await prisma.neighborhood.findMany({
      where: includeDeletedWhere(wantsIncludeDeleted(req)),
      orderBy: { name: "asc" },
    });
    return res.status(200).json({
      neighborhoods: neighborhoods.map(serializeNeighborhood),
    });
  }

  if (req.method === "POST") {
    const parsed = createSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    try {
      const created = await prisma.neighborhood.create({
        data: {
          name: parsed.data.name,
          emoji: parsed.data.emoji ?? null,
          onMap: parsed.data.onMap ?? false,
        },
      });
      return res.status(201).json({
        neighborhood: serializeNeighborhood(created),
      });
    } catch (error) {
      console.error("agent create neighborhood:", error);
      return res
        .status(409)
        .json({ error: "A neighborhood with this name already exists" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
