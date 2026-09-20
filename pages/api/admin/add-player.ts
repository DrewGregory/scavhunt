import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";

const RequestBody = z.object({
  teamId: z.string(),
  userId: z.string(),
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

    const { teamId, userId } = parsed.data;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { teamId },
    });

    return res.status(200).json({ user: updatedUser });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
