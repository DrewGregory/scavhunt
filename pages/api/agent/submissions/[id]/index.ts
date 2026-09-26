import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminApiKey } from "../../../../../lib/agentAuth";
import { prisma } from "../../../../../lib/prisma";
import { serializeSubmission } from "../../../../../lib/serialize";

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

  const existing = await prisma.submission.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: "Submission not found" });
  }
  if (existing.deletedAt) {
    return res.status(200).json({ ok: true, alreadyDeleted: true });
  }

  const submission = await prisma.submission.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return res.status(200).json({
    ok: true,
    submission: {
      ...serializeSubmission(submission),
      deletedAt: submission.deletedAt?.toISOString() ?? null,
    },
  });
}
