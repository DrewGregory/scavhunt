import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody, serializeTeam } from "../../../lib/serialize";

const TEAM_COLORS = [
  "#E53E3E",
  "#DD6B20",
  "#D69E2E",
  "#38A169",
  "#319795",
  "#3182CE",
  "#5A67D8",
  "#805AD5",
  "#D53F8C",
  "#718096",
] as const;

const RequestBody = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
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
    const teamCount = await prisma.team.count();
    const color =
      parsed.data.color ?? TEAM_COLORS[teamCount % TEAM_COLORS.length];

    const newTeam = await prisma.team.create({
      data: { name, emoji, color },
    });

    return res.status(200).json({ team: serializeTeam(newTeam) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
