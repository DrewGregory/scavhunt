import { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../lib/dbConnect";
import { FavoriteModel } from "../../models/Favorite";
import { z } from "zod";

const querySchema = z.object({
  userId: z.string().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await dbConnect();

    const { userId } = querySchema.parse(req.query);

    // Get all favorites with counts
    const favoriteCounts = await FavoriteModel.aggregate([
      {
        $group: {
          _id: "$submissionId",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get user's favorites if userId provided
    let userFavorites: string[] = [];
    if (userId) {
      const favorites = await FavoriteModel.find({ userId }).select("submissionId");
      userFavorites = favorites.map((f) => f.submissionId.toString());
    }

    return res.status(200).json({
      counts: favoriteCounts.reduce((acc, item) => {
        acc[item._id.toString()] = item.count;
        return acc;
      }, {} as Record<string, number>),
      userFavorites,
    });
  } catch (error) {
    console.error("Error fetching favorites:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

