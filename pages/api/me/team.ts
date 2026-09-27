import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import {
  assertSameOrigin,
  requireApiUser,
  requireHuntAccessApi,
} from "../../../lib/auth";
import { firstEmoji } from "../../../lib/emoji";
import { jsonError } from "../../../lib/http";
import { prisma } from "../../../lib/prisma";
import { parseJsonBody, serializeTeam } from "../../../lib/serialize";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  emoji: z.string().trim().min(1).max(16).optional(),
});

/** Team members can update their own team's name and emoji. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;
  if (!(await requireHuntAccessApi(res, user))) return;

  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  if (!user.teamId) {
    return res.status(400).json({ error: "You are not on a team" });
  }

  const parsed = patchSchema.safeParse(parseJsonBody(req.body));
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const { name } = parsed.data;
  let emoji: string | undefined;
  if (parsed.data.emoji !== undefined) {
    const one = firstEmoji(parsed.data.emoji);
    if (!one) {
      return res.status(400).json({ error: "Pick a single emoji" });
    }
    emoji = one;
  }

  if (name === undefined && emoji === undefined) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const team = await prisma.team.update({
    where: { id: user.teamId },
    data: {
      ...(name != null ? { name } : {}),
      ...(emoji != null ? { emoji } : {}),
    },
  });

  return res.status(200).json({ team: serializeTeam(team) });
}
