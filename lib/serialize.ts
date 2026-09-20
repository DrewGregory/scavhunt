import type {
  Challenge,
  ChatMessage,
  Submission,
  Team,
  User,
} from "@prisma/client";
import type {
  SerializedChallenge,
  SerializedChatMessage,
  SerializedSubmission,
  SerializedTeam,
} from "./types";

export function serializeTeam(team: Team): SerializedTeam {
  return {
    id: team.id,
    name: team.name,
    emoji: team.emoji,
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

export function serializeChatMessage(
  message: ChatMessage & { team: Team; user?: User },
): SerializedChatMessage {
  return {
    id: message.id,
    teamId: message.teamId,
    teamName: `${message.team.emoji} ${message.team.name}`,
    message: message.message,
    isAdmin: message.isAdmin,
    createdAt: message.createdAt.toISOString(),
  };
}

export function parseJsonBody(body: unknown): unknown {
  if (typeof body === "string") {
    return JSON.parse(body);
  }
  return body;
}
