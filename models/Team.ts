import mongoose, { Model, Document } from "mongoose";
import { baseMongooseSchema } from "../lib/types";
import { z } from "zod";

export interface Team {
  id: string;
  teamCode: string;
  name: string;
  emoji: string;
  members: Array<{
    firstName: string;
    familyName: string;
  }>
}

export type TeamDocument = Document & Team;

export const serializedTeamSchema = baseMongooseSchema.merge(z.object({
  name: z.string(),
  emoji: z.string(),
  members: z.array(
    z.object({
      firstName: z.string(),
      familyName: z.string(),
    })
  ),
}));

export type SerializedTeam = z.infer<typeof serializedTeamSchema>;

const TeamSchema = new mongoose.Schema<TeamDocument>({
  teamCode: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  emoji: {
    type: String,
    required: true,
  },
  members: {
    type: [
      {
        firstName: {
          type: String,
          required: true,
        },
        familyName: {
          type: String,
          required: true,
        },
      }
    ],
    required: true,
  },
});

export const TeamModel: Model<Team> = mongoose.models?.Team || mongoose.model<Team>("Team", TeamSchema);