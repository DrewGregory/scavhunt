import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";

/** Admin inbox of player → admin messages. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rows = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          phoneE164: true,
          team: {
            select: { id: true, name: true, emoji: true },
          },
        },
      },
    },
  });

  return res.status(200).json({
    messages: rows.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      user: {
        id: m.user.id,
        name: m.user.name,
        phoneE164: m.user.phoneE164,
        team: m.user.team
          ? {
              id: m.user.team.id,
              name: m.user.team.name,
              emoji: m.user.team.emoji,
            }
          : null,
      },
    })),
  });
}
