import type {
  Challenge,
  Submission,
  SubmissionComment,
  Team,
  User,
} from "@prisma/client";
import { toCdnUrl } from "./media";
import type {
  SerializedChallenge,
  SerializedSubmission,
  SerializedSubmissionComment,
  SerializedTeam,
} from "./types";

type CommentWithUser = SubmissionComment & {
  user: User & { team: Team | null };
};

export function serializeTeam(
  team: Pick<Team, "id" | "name" | "emoji" | "color">,
): SerializedTeam {
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
    emoji: challenge.emoji ?? null,
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
    mediaURL: toCdnUrl(submission.mediaURL),
    posterURL: toCdnUrl(submission.posterURL),
    durationSec: submission.durationSec,
    width: submission.width,
    height: submission.height,
    sizeBytes: submission.sizeBytes,
    compressed: submission.compressed,
    note: submission.note,
    createdAt: submission.createdAt.toISOString(),
  };
}

export function serializeSubmissionComment(
  comment: CommentWithUser,
): SerializedSubmissionComment {
  return {
    id: comment.id,
    submissionId: comment.submissionId,
    userId: comment.userId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    user: {
      id: comment.user.id,
      name: comment.user.name,
      isAdmin: comment.user.isAdmin,
      team: comment.user.team ? serializeTeam(comment.user.team) : null,
    },
  };
}

export function parseJsonBody(body: unknown): unknown {
  if (typeof body === "string") {
    return JSON.parse(body);
  }
  return body;
}
