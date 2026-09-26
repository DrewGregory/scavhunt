import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminApiKey } from "../../../../../lib/agentAuth";
import { prisma } from "../../../../../lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  const existing = await prisma.challenge.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: "Challenge not found" });
  }
  if (!existing.deletedAt) {
    return res.status(200).json({ ok: true, alreadyRestored: true });
  }

  await prisma.challenge.update({
    where: { id },
    data: { deletedAt: null },
  });

  return res
    .status(200)
    .json({ ok: true, challenge: { id, deletedAt: null } });
}
