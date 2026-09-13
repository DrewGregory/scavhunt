import { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../lib/dbConnect";
import { FavoriteModel } from "../../models/Favorite";
import { z } from "zod";

const requestSchema = z.object({
  submissionId: z.string(),
  userId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await dbConnect();

    const body = requestSchema.parse(JSON.parse(req.body));
    const { submissionId, userId } = body;

    // Check if favorite already exists
    const existingFavorite = await FavoriteModel.findOne({
      submissionId,
      userId,
    });

    if (existingFavorite) {
      // Remove favorite
      await FavoriteModel.deleteOne({ _id: existingFavorite._id });
      return res.status(200).json({ favorited: false });
    } else {
      // Add favorite
      await FavoriteModel.create({
        submissionId,
        userId,
      });
      return res.status(200).json({ favorited: true });
    }
  } catch (error) {
    console.error("Error toggling favorite:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

