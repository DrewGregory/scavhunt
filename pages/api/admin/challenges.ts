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
      const challenges = await prisma.challenge.findMany({
        orderBy: { title: "asc" },
      });
      return res.status(200).json({
        challenges: challenges.map(serializeChallenge),
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch challenges" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
