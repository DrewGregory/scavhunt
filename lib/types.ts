import { z } from "zod";

export const submissionResponseBodySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    submissionId: z.string(),
    message: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    message: z.string(),
  }),
]);

export type SubmissionResponseBody = z.infer<
  typeof submissionResponseBodySchema
>;

export type LatestTeamLocation = {
  id: string;
  latestLocation: {
    lat: number;
    lng: number;
    id: string;
  };
  emoji: string;
  name: string;
};

export type SerializedSubmission = {
  id: string;
  teamId: string;
  userId: string;
  challengeId: string;
  accepted: boolean;
  rejected: boolean;
  mediaURL: string | null;
  note: string;
  createdAt: string;
};

export type SerializedChallenge = {
  id: string;
  title: string;
  prompt: string;
  emoji: string | null;
  lat: number | null;
  lng: number | null;
  pts: number;
  numWinners: number;
  enabled: boolean;
};

export type SerializedTeam = {
  id: string;
  name: string;
  emoji: string;
  color: string;
};
