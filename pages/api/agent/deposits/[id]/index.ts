import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminApiKey } from "../../../../../lib/agentAuth";
import { prisma } from "../../../../../lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const deposit = await prisma.neighborhoodDeposit.findUnique({
    where: { id },
  });
  if (!deposit) return res.status(404).json({ error: "Deposit not found" });
  if (deposit.deletedAt) {
    return res.status(200).json({ ok: true, alreadyDeleted: true });
  }

  const updated = await prisma.neighborhoodDeposit.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return res.status(200).json({
    ok: true,
    deposit: {
      id: updated.id,
      deletedAt: updated.deletedAt?.toISOString() ?? null,
    },
  });
}
