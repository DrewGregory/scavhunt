import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireApiAdmin(req, res);
  if (!user) return;

  try {
    const body = parseJsonBody(req.body) as { challengeId?: string };
    const { challengeId } = body;

    if (!challengeId) {
      return res.status(400).json({ error: "Challenge ID is required" });
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }
    if (challenge.deletedAt) {
      return res.status(200).json({ message: "Challenge already archived" });
    }

    await prisma.challenge.update({
      where: { id: challengeId },
      data: { deletedAt: new Date() },
    });

    return res.status(200).json({
      message: "Challenge archived successfully",
    });
  } catch (error) {
    console.error("Error archiving challenge:", error);
    return res.status(500).json({ error: "Failed to archive challenge" });
  }
}
