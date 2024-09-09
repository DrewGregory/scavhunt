import { z } from "zod";
import { Types } from "mongoose";


export const submissionResponseBodySchema = z.union([z.object({
    status: z.literal("success"),
    submissionId: z.string(),
    message: z.string(),
}), z.object({
    status: z.literal("error"),
    message: z.string(),
})]);

export type SubmissionResponseBody = z.infer<typeof submissionResponseBodySchema>;

export const mongooseIdSchema = z.instanceof(Types.ObjectId).transform((x) => x.toHexString());
export const baseMongooseSchema = z.object({
    _id: mongooseIdSchema,
});


export const latestTeamLocationSchema = z.object({
    _id: mongooseIdSchema,
    latestLocation: z.object({
        lat: z.number(),
        lng: z.number(),
        _id: mongooseIdSchema,
    }),
    emoji: z.string(),
})

export type LatestTeamLocation = z.infer<typeof latestTeamLocationSchema>;