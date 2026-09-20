import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody, serializeTeam } from "../../../lib/serialize";

const RequestBody = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiAdmin(req, res);
  if (!user) return;

  if (req.method === "POST") {
    const parsed = RequestBody.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { name, emoji } = parsed.data;

    const newTeam = await prisma.team.create({
      data: { name, emoji },
    });

    return res.status(200).json({ team: serializeTeam(newTeam) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
