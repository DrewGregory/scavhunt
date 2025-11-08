import mongoose, { Model, ObjectId, Types } from "mongoose";
import { z } from "zod";
import { baseMongooseSchema, mongooseIdSchema } from "../lib/types";

export interface Like {
  teamId: ObjectId;
  submissionId: ObjectId;
  createdAt: Date;
  id: string;
}

export const serializedLikeSchema = baseMongooseSchema.merge(
  z.object({
    teamId: mongooseIdSchema,
    submissionId: mongooseIdSchema,
    createdAt: z.date().transform((x) => x.toISOString()),
  })
);

export type SerializedLike = z.infer<typeof serializedLikeSchema>;

const LikeSchema = new mongoose.Schema<Like>({
  teamId: {
    type: Types.ObjectId,
    required: true,
    index: true,
  },
  submissionId: {
    type: Types.ObjectId,
    required: true,
    index: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

// Create compound index for efficient queries
LikeSchema.index({ teamId: 1, submissionId: 1 });
LikeSchema.index({ submissionId: 1 });

export const LikeModel: Model<Like> =
  (mongoose.models.Like as Model<Like>) ||
  mongoose.model<Like>("Like", LikeSchema);
