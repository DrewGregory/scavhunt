import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";

/**
 * Admin deposit audit + void.
 * GET lists recent deposits; POST { action: "void", id } soft-deletes one.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const includeVoided = req.query.includeVoided === "1";
    const deposits = await prisma.neighborhoodDeposit.findMany({
      where: includeVoided ? undefined : { voidedAt: null },
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
        voidedAt: d.voidedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        team: d.team,
        neighborhood: d.neighborhood,
        user: d.user,
      })),
    });
  }

  if (req.method === "POST") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const schema = z.object({
      action: z.literal("void"),
      id: z.string().min(1),
    });
    const parsed = schema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const deposit = await prisma.neighborhoodDeposit.findUnique({
      where: { id: parsed.data.id },
    });
    if (!deposit) {
      return res.status(404).json({ error: "Deposit not found" });
    }
    if (deposit.voidedAt) {
      return res.status(200).json({ ok: true, alreadyVoided: true });
    }

    const updated = await prisma.neighborhoodDeposit.update({
      where: { id: deposit.id },
      data: { voidedAt: new Date() },
    });

    return res.status(200).json({
      ok: true,
      deposit: {
        id: updated.id,
        voidedAt: updated.voidedAt?.toISOString() ?? null,
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
