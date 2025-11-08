import mongoose, { Model, ObjectId, Types } from "mongoose";
import { z } from "zod";
import { baseMongooseSchema, mongooseIdSchema } from "../lib/types";

export interface Chat {
  teamId: ObjectId;
  teamName: string;
  message: string;
  isAdmin: boolean;
  createdAt: Date;
  id: string;
}

export const serializedChatSchema = baseMongooseSchema.merge(
  z.object({
    teamId: mongooseIdSchema,
    teamName: z.string(),
    message: z.string(),
    isAdmin: z.boolean().default(false),
    createdAt: z.date().transform((x) => x.toISOString()),
  })
);

export type SerializedChat = z.infer<typeof serializedChatSchema>;

const ChatSchema = new mongoose.Schema<Chat>({
  teamId: {
    type: Types.ObjectId,
    required: true,
    index: true,
  },
  teamName: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  isAdmin: {
    type: Boolean,
    required: true,
    default: false,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
});

export const ChatModel: Model<Chat> =
  (mongoose.models.Chat as Model<Chat>) ||
  mongoose.model<Chat>("Chat", ChatSchema);
