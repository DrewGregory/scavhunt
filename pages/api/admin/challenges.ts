import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { serializeChallenge } from "../../../lib/serialize";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiAdmin(req, res);
  if (!user) return;

  if (req.method === "GET") {
    try {
      const includeDeleted = req.query.includeDeleted === "1";
      const challenges = await prisma.challenge.findMany({
        where: includeDeleted ? undefined : { deletedAt: null },
        orderBy: { title: "asc" },
      });
      return res.status(200).json({
        challenges: challenges.map((c) => ({
          ...serializeChallenge(c),
          createdAt: c.createdAt.toISOString(),
          deletedAt: c.deletedAt?.toISOString() ?? null,
        })),
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch challenges" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
