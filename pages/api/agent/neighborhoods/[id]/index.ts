import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminApiKey } from "../../../../../lib/agentAuth";
import { prisma } from "../../../../../lib/prisma";
import { parseJsonBody } from "../../../../../lib/serialize";
import { neighborhoodEmoji } from "../../../../../lib/neighborhoodEmoji";

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

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  emoji: z.string().trim().max(16).nullable().optional(),
  onMap: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "GET") {
    const neighborhood = await prisma.neighborhood.findUnique({
      where: { id },
    });
    if (!neighborhood) {
      return res.status(404).json({ error: "Neighborhood not found" });
    }
    return res.status(200).json({
      neighborhood: serializeNeighborhood(neighborhood),
    });
  }

  if (req.method === "PATCH") {
    const parsed = patchSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const existing = await prisma.neighborhood.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Neighborhood not found" });
    }

    const data: {
      name?: string;
      emoji?: string | null;
      onMap?: boolean;
    } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.emoji !== undefined) data.emoji = parsed.data.emoji;
    if (parsed.data.onMap !== undefined) data.onMap = parsed.data.onMap;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    try {
      const neighborhood = await prisma.neighborhood.update({
        where: { id },
        data,
      });
      return res.status(200).json({
        neighborhood: serializeNeighborhood(neighborhood),
      });
    } catch (error) {
      console.error("agent patch neighborhood:", error);
      return res
        .status(409)
        .json({ error: "A neighborhood with this name already exists" });
    }
  }

  if (req.method === "DELETE") {
    const existing = await prisma.neighborhood.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Neighborhood not found" });
    }
    if (existing.deletedAt) {
      return res.status(200).json({ ok: true, alreadyDeleted: true });
    }
    const neighborhood = await prisma.neighborhood.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return res.status(200).json({
      ok: true,
      neighborhood: serializeNeighborhood(neighborhood),
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
