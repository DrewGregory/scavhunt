import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { PutObjectAclCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../lib/prisma";
import { requireApiUser, requireHuntAccessApi } from "../../lib/auth";
import { getSpacesConfig } from "../../lib/s3";
import { parseJsonBody } from "../../lib/serialize";
import type { SubmissionResponseBody } from "../../lib/types";
import {
  attemptIdFromHeaders,
  logServerEvent,
} from "../../lib/serverTelemetry";
import {
  parseMediaMeta,
  spacesMediaUrlRegex,
  type MediaMeta,
} from "../../lib/upload/submissionMeta";

const requestBodySchema = z.object({
  submissionId: z.string(),
  note: z.string().optional(),
  mediaURL: z.string().optional(),
  challengeId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const respond = (status: number, body: SubmissionResponseBody) => {
    res.status(status).json(body);
  };

  const user = await requireApiUser(req, res);
  if (!user) return;

  if (!(await requireHuntAccessApi(res, user))) return;

  const attemptId = attemptIdFromHeaders(req.headers);
  const validationFailed = (message: string, meta?: Record<string, unknown>) =>
    void logServerEvent({
      type: "validation_failed",
      level: "warn",
      userId: user.id,
      teamId: user.teamId,
      attemptId,
      errorMessage: message,
      meta: { route: "update-submission-media", ...meta },
    });

  const body = parseJsonBody(req.body);
  const parsedReq = requestBodySchema.safeParse(body);
  if (!parsedReq.success) {
    validationFailed("Invalid request body", {
      issues: parsedReq.error.issues.map((i) => i.path.join(".")),
    });
    return respond(400, {
      status: "error",
      message: "Invalid request body",
    });
  }
  const { submissionId, note, mediaURL, challengeId } = parsedReq.data;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
  });

  if (submission == null) {
    return respond(400, {
      status: "error",
      message: `Submission with id '${submissionId}' not found`,
    });
  }

  const isOriginalTeam =
    user.teamId != null && submission.teamId === user.teamId;
  if (!user.isAdmin && !isOriginalTeam) {
    return respond(400, {
      status: "error",
      message: "You don't have permission to update this submission",
    });
  }

  if (!mediaURL && !note) {
    return respond(400, {
      status: "error",
      message: "Please provide either a file or a note to update",
    });
  }

  const teamIdForAcl = user.teamId ?? submission.teamId;

  let mediaMeta: MediaMeta = {};
  if (mediaURL != null && mediaURL !== "") {
    const spaces = getSpacesConfig();
    if (!spaces) {
      return respond(400, {
        status: "error",
        message: "Storage not configured on server",
      });
    }

    const match = mediaURL.match(spacesMediaUrlRegex(spaces));
    if (match == null) {
      validationFailed("Invalid mediaURL format", { mediaURL, submissionId });
      return respond(400, {
        status: "error",
        message: "Invalid mediaURL format",
      });
    }
    const [, challengeIdFromUrl, teamIdFromUrl, fileName] = match;
    if (
      challengeIdFromUrl !== challengeId ||
      teamIdFromUrl !== teamIdForAcl
    ) {
      validationFailed("Media URL challenge/team mismatch", { mediaURL, submissionId });
      return respond(400, {
        status: "error",
        message: "Invalid media URL - mismatch with challenge or team ID",
      });
    }

    const key = `${challengeId}/${teamIdForAcl}/${fileName}`;
    try {
      await spaces.client.send(
        new PutObjectAclCommand({
          Bucket: spaces.bucket,
          Key: key,
          ACL: "public-read",
        }),
      );
    } catch (error) {
      console.error("Error setting ACL:", error);
      return respond(400, {
        status: "error",
        message: "Failed to set file permissions. Try again.",
      });
    }

    const parsedMeta = parseMediaMeta(body, {
      spaces,
      challengeId,
      teamId: teamIdForAcl,
    });
    mediaMeta = parsedMeta.meta;
    if (parsedMeta.problems.length > 0) {
      validationFailed("Dropped invalid media metadata", {
        problems: parsedMeta.problems,
        submissionId,
      });
    }
    if (parsedMeta.posterKey) {
      // The presigned PUT already requests public-read; this covers hosts that ignore it.
      await spaces.client
        .send(
          new PutObjectAclCommand({
            Bucket: spaces.bucket,
            Key: parsedMeta.posterKey,
            ACL: "public-read",
          }),
        )
        .catch((err) => console.error("poster ACL error", err));
    }
  }

  const updateFields: Prisma.SubmissionUpdateInput = {};
  if (mediaURL) {
    updateFields.mediaURL = mediaURL;
    // Replace (not merge) so a new video never keeps the old one's poster or dimensions.
    updateFields.posterURL = mediaMeta.posterURL ?? null;
    updateFields.durationSec = mediaMeta.durationSec ?? null;
    updateFields.width = mediaMeta.width ?? null;
    updateFields.height = mediaMeta.height ?? null;
    updateFields.sizeBytes = mediaMeta.sizeBytes ?? null;
    updateFields.originalSizeBytes = mediaMeta.originalSizeBytes ?? null;
    updateFields.compressed = mediaMeta.compressed ?? null;
  }
  if (note !== undefined) {
    updateFields.note = note;
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: updateFields,
  });

  void logServerEvent({
    type: "submission_media_updated",
    userId: user.id,
    teamId: submission.teamId,
    challengeId: submission.challengeId,
    submissionId,
    attemptId,
    bytes: mediaMeta.sizeBytes ?? null,
    meta: {
      mediaUpdated: Boolean(mediaURL),
      noteUpdated: note !== undefined,
      compressed: mediaMeta.compressed ?? null,
      hasPoster: Boolean(mediaMeta.posterURL),
      originalSizeBytes: mediaMeta.originalSizeBytes ?? null,
    },
  });

  return respond(200, {
    status: "success",
    submissionId,
    message:
      mediaURL && note
        ? "Video and note updated successfully"
        : mediaURL
          ? "Video uploaded successfully"
          : "Note updated successfully",
  });
}
