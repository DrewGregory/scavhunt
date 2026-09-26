import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminApiKey } from "../../../../../lib/agentAuth";
import { prisma } from "../../../../../lib/prisma";
import { parseJsonBody, serializeChallenge } from "../../../../../lib/serialize";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  prompt: z.string().optional(),
  pts: z.number().int().positive().optional(),
  numWinners: z.number().int().min(1).optional(),
  lat: z.number().finite().nullable().optional(),
  lng: z.number().finite().nullable().optional(),
  enabled: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "GET") {
    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }
    return res.status(200).json({
      challenge: {
        ...serializeChallenge(challenge),
        deletedAt: challenge.deletedAt?.toISOString() ?? null,
        createdAt: challenge.createdAt.toISOString(),
      },
    });
  }

  if (req.method === "PATCH") {
    const parsed = patchSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const existing = await prisma.challenge.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    const data: {
      title?: string;
      prompt?: string;
      pts?: number;
      numWinners?: number;
      lat?: number | null;
      lng?: number | null;
      enabled?: boolean;
    } = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.prompt !== undefined) data.prompt = parsed.data.prompt;
    if (parsed.data.pts !== undefined) data.pts = parsed.data.pts;
    if (parsed.data.numWinners !== undefined) {
      data.numWinners = parsed.data.numWinners;
    }
    if (parsed.data.lat !== undefined) data.lat = parsed.data.lat;
    if (parsed.data.lng !== undefined) data.lng = parsed.data.lng;
    if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const challenge = await prisma.challenge.update({ where: { id }, data });
    return res.status(200).json({
      challenge: {
        ...serializeChallenge(challenge),
        deletedAt: challenge.deletedAt?.toISOString() ?? null,
      },
    });
  }

  if (req.method === "DELETE") {
    const existing = await prisma.challenge.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Challenge not found" });
    }
    if (existing.deletedAt) {
      return res.status(200).json({ ok: true, alreadyDeleted: true });
    }
    const challenge = await prisma.challenge.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return res.status(200).json({
      ok: true,
      challenge: {
        ...serializeChallenge(challenge),
        deletedAt: challenge.deletedAt?.toISOString() ?? null,
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
