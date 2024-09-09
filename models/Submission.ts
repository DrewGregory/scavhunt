import mongoose, { ObjectId, Types } from "mongoose";
import { z } from "zod";
import { baseMongooseSchema, mongooseIdSchema } from "../lib/types";

export interface Submission {
  teamId: ObjectId;
  challengeId: ObjectId;
  accepted: boolean;
  mediaURL?: string | null | undefined;
  rejected?: boolean | null | undefined;
  note: string;
  createdAt: Date;
  id: string;
}

export const serializedSubmissionSchema = baseMongooseSchema.merge(z.object({
  teamId: mongooseIdSchema,
  challengeId: mongooseIdSchema,
  accepted: z.boolean(),
  mediaURL: z.string().optional(),
  note: z.string(),
  createdAt: z.date().transform((x) => x.toISOString()),
  rejected: z.boolean().optional(),
}));
export type SerializedSubmission = z.infer<typeof serializedSubmissionSchema>;

const SubmissionSchema = new mongoose.Schema<Submission>({
  teamId: {
    type: Types.ObjectId,
    required: true,
    index: true,
  },
  challengeId: {
    type: Types.ObjectId,
    required: true,
  },
  accepted: {
    type: Boolean,
    required: true,
  },
  rejected: {
    type: Boolean,
  },
  mediaURL: {
    type: String,
    required: false,
  },
  note: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
  },
});

export const SubmissionModel = mongoose.models.Submission || mongoose.model<Submission>(
  "Submission",
  SubmissionSchema
);
