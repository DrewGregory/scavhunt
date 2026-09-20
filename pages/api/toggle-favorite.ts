import { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireApiUser } from "../../lib/auth";
import { parseJsonBody } from "../../lib/serialize";

const requestSchema = z.object({
  submissionId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireApiUser(req, res);
    if (!user) return;

    const body = requestSchema.parse(parseJsonBody(req.body));
    const { submissionId } = body;

    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        submissionId_userId: {
          submissionId,
          userId: user.id,
        },
      },
    });

    if (existingFavorite) {
      await prisma.favorite.delete({
        where: { id: existingFavorite.id },
      });
      return res.status(200).json({ favorited: false });
    }

    await prisma.favorite.create({
      data: {
        submissionId,
        userId: user.id,
      },
    });
    return res.status(200).json({ favorited: true });
  } catch (error) {
    console.error("Error toggling favorite:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
