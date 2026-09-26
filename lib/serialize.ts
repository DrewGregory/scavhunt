import type {
  Challenge,
  Submission,
  Team,
} from "@prisma/client";
import type {
  SerializedChallenge,
  SerializedSubmission,
  SerializedTeam,
} from "./types";

export function serializeTeam(team: Team): SerializedTeam {
  return {
    id: team.id,
    name: team.name,
    emoji: team.emoji,
    color: team.color,
  };
}

export function serializeChallenge(challenge: Challenge): SerializedChallenge {
  return {
    id: challenge.id,
    title: challenge.title,
    prompt: challenge.prompt,
    lat: challenge.lat,
    lng: challenge.lng,
    pts: challenge.pts,
    numWinners: challenge.numWinners,
    enabled: challenge.enabled,
  };
}

export function serializeSubmission(
  submission: Submission,
): SerializedSubmission {
  return {
    id: submission.id,
    teamId: submission.teamId,
    userId: submission.userId,
    challengeId: submission.challengeId,
    accepted: submission.accepted,
    rejected: submission.rejected,
    mediaURL: submission.mediaURL,
    note: submission.note,
    createdAt: submission.createdAt.toISOString(),
  };
}

export function parseJsonBody(body: unknown): unknown {
  if (typeof body === "string") {
    return JSON.parse(body);
  }
  return body;
}
