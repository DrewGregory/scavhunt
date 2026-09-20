import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../lib/prisma";
import { requireApiUser } from "../../lib/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireApiUser(req, res);
    if (!user) return;

    const favoriteCounts = await prisma.favorite.groupBy({
      by: ["submissionId"],
      _count: { submissionId: true },
    });

    const userFavoriteRows = await prisma.favorite.findMany({
      where: { userId: user.id },
      select: { submissionId: true },
    });

    return res.status(200).json({
      counts: favoriteCounts.reduce(
        (acc, item) => {
          acc[item.submissionId] = item._count.submissionId;
          return acc;
        },
        {} as Record<string, number>,
      ),
      userFavorites: userFavoriteRows.map((f) => f.submissionId),
    });
  } catch (error) {
    console.error("Error fetching favorites:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
