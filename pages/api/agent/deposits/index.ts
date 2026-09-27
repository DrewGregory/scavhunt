import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import {
  optionalCreatedAtSchema,
  requireAdminApiKey,
  wantsIncludeDeleted,
} from "../../../../lib/agentAuth";
import { includeDeletedWhere } from "../../../../lib/softDelete";
import { prisma } from "../../../../lib/prisma";
import { parseJsonBody } from "../../../../lib/serialize";

const createSchema = z.object({
  teamId: z.string().min(1),
  neighborhoodId: z.string().min(1),
  userId: z.string().min(1),
  points: z.number().int().positive(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  accuracy: z.number().finite().nullable().optional(),
  /** Artificial timestamp for hunt simulation (ISO-8601). */
  createdAt: optionalCreatedAtSchema,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  if (req.method === "GET") {
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

  if (req.method === "POST") {
    const parsed = createSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid body",
        details: parsed.error.flatten(),
      });
    }

    const [team, user, neighborhood] = await Promise.all([
      prisma.team.findFirst({
        where: { id: parsed.data.teamId, deletedAt: null },
      }),
      prisma.user.findFirst({
        where: { id: parsed.data.userId, deletedAt: null },
      }),
      prisma.neighborhood.findFirst({
        where: { id: parsed.data.neighborhoodId, deletedAt: null },
      }),
    ]);
    if (!team) return res.status(404).json({ error: "Team not found" });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!neighborhood) {
      return res.status(404).json({ error: "Neighborhood not found" });
    }

    const deposit = await prisma.neighborhoodDeposit.create({
      data: {
        teamId: parsed.data.teamId,
        neighborhoodId: parsed.data.neighborhoodId,
        userId: parsed.data.userId,
        points: parsed.data.points,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        accuracy: parsed.data.accuracy ?? null,
        ...(parsed.data.createdAt
          ? { createdAt: parsed.data.createdAt }
          : {}),
      },
      include: {
        team: { select: { id: true, name: true, emoji: true, color: true } },
        neighborhood: { select: { id: true, name: true, emoji: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json({
      deposit: {
        id: deposit.id,
        points: deposit.points,
        lat: deposit.lat,
        lng: deposit.lng,
        accuracy: deposit.accuracy,
        deletedAt: null,
        createdAt: deposit.createdAt.toISOString(),
        team: deposit.team,
        neighborhood: deposit.neighborhood,
        user: deposit.user,
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
