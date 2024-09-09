import mongoose, { Model, ObjectId, Types } from "mongoose";
import { z } from "zod";
import { mongooseIdSchema, baseMongooseSchema } from "../lib/types";

export interface Location {
  teamId: ObjectId;
  loc: {
    lat: number;
    lng: number;
  };
  id: string;
  createdAt: Date;
}


export const serializedLocationSchema = baseMongooseSchema.merge(z.object({
  teamId: mongooseIdSchema,
  loc: baseMongooseSchema.merge(z.object({
    lat: z.number(),
    lng: z.number(),
  })),
  createdAt: z.date().transform((x) => x.toLocaleDateString()),
}));
export type SerializedLocation = z.infer<typeof serializedLocationSchema>;

const LocationSchema = new mongoose.Schema<Location>({
  teamId: {
    type: Types.ObjectId,
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
    },
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
  }
});

export const LocationModel: Model<Location> = mongoose.models.Location || mongoose.model<Location>("Location", LocationSchema);