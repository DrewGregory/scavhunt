import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminApiKey, wantsIncludeDeleted } from "../../../../lib/agentAuth";
import { includeDeletedWhere } from "../../../../lib/softDelete";
import { prisma } from "../../../../lib/prisma";
import {
  serializeChallenge,
  serializeSubmission,
  serializeTeam,
} from "../../../../lib/serialize";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const status = typeof req.query.status === "string" ? req.query.status : "";
  const moderationWhere =
    status === "pending"
      ? { accepted: false, rejected: false }
      : status === "accepted"
        ? { accepted: true }
        : status === "rejected"
          ? { rejected: true }
          : {};

  const submissions = await prisma.submission.findMany({
    where: {
      ...includeDeletedWhere(wantsIncludeDeleted(req)),
      ...moderationWhere,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      team: true,
      challenge: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return res.status(200).json({
    submissions: submissions.map((s) => ({
      ...serializeSubmission(s),
      deletedAt: s.deletedAt?.toISOString() ?? null,
      team: serializeTeam(s.team),
      challenge: serializeChallenge(s.challenge),
      user: s.user,
    })),
  });
}
