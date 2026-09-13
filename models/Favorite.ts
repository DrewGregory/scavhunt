import mongoose from "mongoose";
import { z } from "zod";

export const favoriteSchema = new mongoose.Schema({
  submissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Submission",
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

// Create compound index to ensure one favorite per user per submission
favoriteSchema.index({ submissionId: 1, userId: 1 }, { unique: true });

export const FavoriteModel =
  (mongoose.models.Favorite as mongoose.Model<any>) ||
  mongoose.model("Favorite", favoriteSchema);

export const serializedFavoriteSchema = z.object({
  _id: z.string(),
  submissionId: z.string(),
  userId: z.string(),
  createdAt: z.string(),
});

