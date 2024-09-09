import mongoose, { Model } from "mongoose";
import { z } from "zod";
import { baseMongooseSchema } from "../lib/types";

export interface Challenge {
  title: string;
  prompt: string;
  loc: {
    lat: number;
    lng: number;
  };
  pts: number;
  numWinners: number;
  id: string;
}

export const serializedChallengeSchema = baseMongooseSchema.merge(z.object({
  title: z.string(),
  prompt: z.string(),
  loc: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  pts: z.number(),
  numWinners: z.number(),
}));

export type SerializedChallenge = z.infer<typeof serializedChallengeSchema>;

const ChallengeSchema = new mongoose.Schema<Challenge>({
  title: {
    required: true,
    type: String,
  },
  prompt: {
    type: String,
    required: true,
  },
  loc: {
    type: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
    }
  },
  numWinners: {
    type: Number,
    required: true,
  },
  pts: {
    type: Number,
    required: true,
  }
});

export const ChallengeModel: Model<Challenge> = mongoose.models.Challenge || mongoose.model<Challenge>("Challenge", ChallengeSchema);