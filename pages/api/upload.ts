import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { PutObjectAclCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../lib/prisma";
import { requireApiUser } from "../../lib/auth";
import { requireHuntStartedApi } from "../../lib/time";
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
  challengeId: z.string(),
  note: z.string(),
  mediaURL: z.string().optional(),
  skipUpload: z.boolean().optional(),
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

  if (!(await requireHuntStartedApi(res, user.isAdmin))) return;

  if (!user.teamId) {
    return respond(400, {
      status: "error",
      message: "You must be on a team to submit",
    });
  }

  const teamId = user.teamId;
  const attemptId = attemptIdFromHeaders(req.headers);
  const validationFailed = (message: string, meta?: Record<string, unknown>) =>
    void logServerEvent({
      type: "validation_failed",
      level: "warn",
      userId: user.id,
      teamId,
      attemptId,
      errorMessage: message,
      meta: { route: "upload", ...meta },
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
  const { challengeId, note, mediaURL, skipUpload } = parsedReq.data;

  if (note == null || note === "") {
    return respond(400, {
      status: "error",
      message: "Please provide a note",
    });
  }

  if (challengeId == null || challengeId === "") {
    return respond(400, {
      status: "error",
      message: "Please provide challengeId",
    });
  }

  if (!skipUpload && (mediaURL == null || mediaURL === "")) {
    return respond(400, {
      status: "error",
      message: "Please upload a file or check 'Skip upload'",
    });
  }

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
      validationFailed("Invalid mediaURL format", { mediaURL });
      return respond(400, {
        status: "error",
        message: "Invalid mediaURL format",
      });
    }
    const [, challengeIdFromUrl, teamIdFromUrl, fileName] = match;
    if (challengeIdFromUrl !== challengeId || teamIdFromUrl !== teamId) {
      validationFailed("Media URL challenge/team mismatch", { mediaURL });
      return respond(400, {
        status: "error",
        message: "Invalid media URL",
      });
    }

    const key = `${challengeId}/${teamId}/${fileName}`;
    await spaces.client.send(
      new PutObjectAclCommand({
        Bucket: spaces.bucket,
        Key: key,
        ACL: "public-read",
      }),
    );

    const parsedMeta = parseMediaMeta(body, { spaces, challengeId, teamId });
    mediaMeta = parsedMeta.meta;
    if (parsedMeta.problems.length > 0) {
      validationFailed("Dropped invalid media metadata", {
        problems: parsedMeta.problems,
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

  const submission = await prisma.submission.create({
    data: {
      teamId,
      userId: user.id,
      challengeId,
      accepted: false,
      rejected: false,
      mediaURL: mediaURL || null,
      note,
      ...mediaMeta,
    },
  });

  void logServerEvent({
    type: "submission_created",
    userId: user.id,
    teamId,
    challengeId,
    submissionId: submission.id,
    attemptId,
    bytes: mediaMeta.sizeBytes ?? null,
    meta: {
      hasMedia: Boolean(mediaURL),
      skipUpload: Boolean(skipUpload),
      compressed: mediaMeta.compressed ?? null,
      hasPoster: Boolean(mediaMeta.posterURL),
      originalSizeBytes: mediaMeta.originalSizeBytes ?? null,
    },
  });

  return respond(200, {
    status: "success",
    submissionId: submission.id,
    message: "Submission uploaded successfully",
  });
}
