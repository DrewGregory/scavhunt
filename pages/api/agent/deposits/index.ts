import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminApiKey, wantsIncludeDeleted } from "../../../../lib/agentAuth";
import { includeDeletedWhere } from "../../../../lib/softDelete";
import { prisma } from "../../../../lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const deposits = await prisma.neighborhoodDeposit.findMany({
    where: includeDeletedWhere(wantsIncludeDeleted(req)),
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      team: { select: { id: true, name: true, emoji: true, color: true } },
      neighborhood: { select: { id: true, name: true, emoji: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return res.status(200).json({
    deposits: deposits.map((d) => ({
      id: d.id,
      points: d.points,
      lat: d.lat,
      lng: d.lng,
      accuracy: d.accuracy,
      deletedAt: d.deletedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      team: d.team,
      neighborhood: d.neighborhood,
      user: d.user,
    })),
  });
}
