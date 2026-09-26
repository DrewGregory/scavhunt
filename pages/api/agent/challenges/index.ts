import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminApiKey, wantsIncludeDeleted } from "../../../../lib/agentAuth";
import { includeDeletedWhere } from "../../../../lib/softDelete";
import { prisma } from "../../../../lib/prisma";
import { parseJsonBody, serializeChallenge } from "../../../../lib/serialize";
import { firstEmoji } from "../../../../lib/emoji";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  prompt: z.string().optional(),
  emoji: z.string().trim().max(16).nullable().optional(),
  pts: z.number().int().positive(),
  numWinners: z.number().int().min(1),
  lat: z.number().finite().nullable().optional(),
  lng: z.number().finite().nullable().optional(),
  /** Omit → true for back-compat; pass false to create drafts. */
  enabled: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  if (req.method === "GET") {
    const challenges = await prisma.challenge.findMany({
      where: includeDeletedWhere(wantsIncludeDeleted(req)),
      orderBy: { title: "asc" },
    });
    return res.status(200).json({
      challenges: challenges.map((c) => ({
        ...serializeChallenge(c),
        deletedAt: c.deletedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  }

  if (req.method === "POST") {
    const parsed = createSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const existing = await prisma.challenge.findFirst({
      where: { title: parsed.data.title, deletedAt: null },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "A challenge with this title already exists" });
    }

    const challenge = await prisma.challenge.create({
      data: {
        title: parsed.data.title,
        prompt: parsed.data.prompt?.trim() || " ",
        emoji:
          parsed.data.emoji === undefined
            ? null
            : firstEmoji(parsed.data.emoji ?? "") ?? null,
        pts: parsed.data.pts,
        numWinners: parsed.data.numWinners,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
        enabled: parsed.data.enabled ?? true,
      },
    });

    return res.status(201).json({
      challenge: {
        ...serializeChallenge(challenge),
        deletedAt: null,
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
