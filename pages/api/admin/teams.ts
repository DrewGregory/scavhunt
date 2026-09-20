import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiAdmin(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const teams = await prisma.team.findMany({
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneE164: true,
            isAdmin: true,
            isActive: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
    return res.status(200).json({ teams });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
