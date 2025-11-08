import mongoose, { Model, ObjectId, Types } from "mongoose";
import { z } from "zod";
import { baseMongooseSchema, mongooseIdSchema } from "../lib/types";

export interface ScavAIMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ScavAIConversation {
  teamId: ObjectId;
  teamName: string;
  messages: ScavAIMessage[];
  createdAt: Date;
  updatedAt: Date;
  id: string;
}

export const serializedScavAIConversationSchema = baseMongooseSchema.merge(
  z.object({
    teamId: mongooseIdSchema,
    teamName: z.string(),
    messages: z.array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.date().transform((x) => x.toISOString()),
      })
    ),
    createdAt: z.date().transform((x) => x.toISOString()),
    updatedAt: z.date().transform((x) => x.toISOString()),
  })
);

export type SerializedScavAIConversation = z.infer<
  typeof serializedScavAIConversationSchema
>;

const ScavAIMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "assistant"],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const ScavAIConversationSchema = new mongoose.Schema<ScavAIConversation>({
  teamId: {
    type: Types.ObjectId,
    required: true,
    index: true,
  },
  teamName: {
    type: String,
    required: true,
  },
  messages: {
    type: [ScavAIMessageSchema],
    required: true,
    default: [],
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

export const ScavAIConversationModel: Model<ScavAIConversation> =
  (mongoose.models.ScavAIConversation as Model<ScavAIConversation>) ||
  mongoose.model<ScavAIConversation>(
    "ScavAIConversation",
    ScavAIConversationSchema
  );

