import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";
import { neighborhoodEmoji } from "../../../lib/neighborhoodEmoji";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emoji: z.string().trim().max(16).optional().nullable(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  emoji: z.string().trim().max(16).nullable().optional(),
});

function serializeNeighborhood(n: {
  id: string;
  name: string;
  emoji: string | null;
  createdAt: Date;
  _count?: { matchupsAsA: number; matchupsAsB: number; votes: number };
}) {
  const matchupCount =
    (n._count?.matchupsAsA ?? 0) + (n._count?.matchupsAsB ?? 0);
  return {
    id: n.id,
    name: n.name,
    emoji: n.emoji,
    displayEmoji: neighborhoodEmoji(n.name, n.emoji),
    createdAt: n.createdAt.toISOString(),
    matchupCount,
    voteCount: n._count?.votes ?? 0,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const neighborhoods = await prisma.neighborhood.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            matchupsAsA: true,
            matchupsAsB: true,
            votes: true,
          },
        },
      },
    });
    return res.status(200).json({
      neighborhoods: neighborhoods.map(serializeNeighborhood),
    });
  }

  if (req.method === "POST") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const parsed = createSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const name = parsed.data.name.trim();
    const emoji = parsed.data.emoji?.trim() || null;

    const existing = await prisma.neighborhood.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: "A neighborhood with that name already exists" });
    }

    const created = await prisma.neighborhood.create({
      data: { name, emoji },
      include: {
        _count: {
          select: { matchupsAsA: true, matchupsAsB: true, votes: true },
        },
      },
    });

    return res.status(200).json({ neighborhood: serializeNeighborhood(created) });
  }

  if (req.method === "PATCH") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const parsed = patchSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const { id, name, emoji } = parsed.data;
    const target = await prisma.neighborhood.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ error: "Neighborhood not found" });
    }

    if (name && name !== target.name) {
      const clash = await prisma.neighborhood.findUnique({ where: { name } });
      if (clash) {
        return res
          .status(409)
          .json({ error: "A neighborhood with that name already exists" });
      }
    }

    const updated = await prisma.neighborhood.update({
      where: { id },
      data: {
        ...(name != null ? { name } : {}),
        ...(emoji !== undefined ? { emoji: emoji?.trim() || null } : {}),
      },
      include: {
        _count: {
          select: { matchupsAsA: true, matchupsAsB: true, votes: true },
        },
      },
    });

    return res.status(200).json({ neighborhood: serializeNeighborhood(updated) });
  }

  if (req.method === "DELETE") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const body = parseJsonBody(req.body) as { id?: string } | null;
    const id =
      typeof req.query.id === "string"
        ? req.query.id
        : typeof body?.id === "string"
          ? body.id
          : null;
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const target = await prisma.neighborhood.findUnique({
      where: { id },
      include: {
        _count: {
          select: { matchupsAsA: true, matchupsAsB: true, votes: true },
        },
      },
    });
    if (!target) {
      return res.status(404).json({ error: "Neighborhood not found" });
    }

    const inUse =
      target._count.matchupsAsA +
        target._count.matchupsAsB +
        target._count.votes >
      0;
    if (inUse) {
      return res.status(400).json({
        error:
          "Neighborhood is used in the bracket. Reset the tournament first, then delete.",
      });
    }

    await prisma.neighborhood.delete({ where: { id } });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
