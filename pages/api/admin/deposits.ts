import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";

function serializeDeposit(d: {
  id: string;
  points: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  deletedAt: Date | null;
  createdAt: Date;
  team: { id: string; name: string; emoji: string; color: string };
  neighborhood: { id: string; name: string; emoji: string | null };
  user: { id: string; name: string; email: string };
}) {
  return {
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
  };
}

const include = {
  team: { select: { id: true, name: true, emoji: true, color: true } },
  neighborhood: { select: { id: true, name: true, emoji: true } },
  user: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Admin deposit audit + create / update / void.
 * GET lists deposits (optional neighborhoodId, includeDeleted).
 * POST { action: "void" | "create" | "update", ... }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const includeDeleted = req.query.includeDeleted === "1";
    const neighborhoodId =
      typeof req.query.neighborhoodId === "string"
        ? req.query.neighborhoodId
        : undefined;

    const deposits = await prisma.neighborhoodDeposit.findMany({
      where: {
        ...(includeDeleted ? {} : { deletedAt: null }),
        ...(neighborhoodId ? { neighborhoodId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: neighborhoodId ? 500 : 500,
      include,
    });

    return res.status(200).json({
      deposits: deposits.map(serializeDeposit),
    });
  }

  if (req.method === "POST") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const body = parseJsonBody(req.body);

    const voidSchema = z.object({
      action: z.literal("void"),
      id: z.string().min(1),
    });
    const createSchema = z.object({
      action: z.literal("create"),
      teamId: z.string().min(1),
      neighborhoodId: z.string().min(1),
      points: z.number().int().positive().max(100_000),
      lat: z.number().optional(),
      lng: z.number().optional(),
    });
    const updateSchema = z.object({
      action: z.literal("update"),
      id: z.string().min(1),
      points: z.number().int().positive().max(100_000),
    });

    const asVoid = voidSchema.safeParse(body);
    if (asVoid.success) {
      const deposit = await prisma.neighborhoodDeposit.findUnique({
        where: { id: asVoid.data.id },
      });
      if (!deposit) {
        return res.status(404).json({ error: "Deposit not found" });
      }
      if (deposit.deletedAt) {
        return res.status(200).json({ ok: true, alreadyDeleted: true });
      }

      const updated = await prisma.neighborhoodDeposit.update({
        where: { id: deposit.id },
        data: { deletedAt: new Date() },
        include,
      });

      return res.status(200).json({
        ok: true,
        deposit: serializeDeposit(updated),
      });
    }

    const asCreate = createSchema.safeParse(body);
    if (asCreate.success) {
      const { teamId, neighborhoodId, points } = asCreate.data;

      const [team, neighborhood] = await Promise.all([
        prisma.team.findFirst({
          where: { id: teamId, deletedAt: null },
          select: { id: true },
        }),
        prisma.neighborhood.findFirst({
          where: { id: neighborhoodId, deletedAt: null },
          select: {
            id: true,
            centerLat: true,
            centerLng: true,
          },
        }),
      ]);

      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      if (!neighborhood) {
        return res.status(404).json({ error: "Neighborhood not found" });
      }

      const lat =
        asCreate.data.lat ??
        neighborhood.centerLat ??
        37.7749;
      const lng =
        asCreate.data.lng ??
        neighborhood.centerLng ??
        -122.4194;

      const created = await prisma.neighborhoodDeposit.create({
        data: {
          teamId,
          neighborhoodId,
          userId: admin.id,
          points,
          lat,
          lng,
          accuracy: null,
        },
        include,
      });

      return res.status(201).json({
        ok: true,
        deposit: serializeDeposit(created),
      });
    }

    const asUpdate = updateSchema.safeParse(body);
    if (asUpdate.success) {
      const existing = await prisma.neighborhoodDeposit.findUnique({
        where: { id: asUpdate.data.id },
      });
      if (!existing) {
        return res.status(404).json({ error: "Deposit not found" });
      }
      if (existing.deletedAt) {
        return res
          .status(400)
          .json({ error: "Cannot edit a deleted deposit" });
      }

      const updated = await prisma.neighborhoodDeposit.update({
        where: { id: existing.id },
        data: { points: asUpdate.data.points },
        include,
      });

      return res.status(200).json({
        ok: true,
        deposit: serializeDeposit(updated),
      });
    }

    return res.status(400).json({ error: "Invalid body" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
