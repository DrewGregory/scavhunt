import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";

const RequestBody = z.object({
  userId: z.string(),
  toTeamId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "POST") {
    const parsed = RequestBody.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { userId, toTeamId } = parsed.data;

    const toTeam = await prisma.team.findUnique({ where: { id: toTeamId } });
    if (!toTeam) {
      return res.status(404).json({ error: "Destination team not found" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { teamId: toTeamId },
    });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
