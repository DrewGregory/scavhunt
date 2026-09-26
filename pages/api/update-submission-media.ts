import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { PutObjectAclCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../lib/prisma";
import { requireApiUser } from "../../lib/auth";
import { requireHuntStartedApi } from "../../lib/time";
import { getSpacesConfig } from "../../lib/s3";
import { parseJsonBody } from "../../lib/serialize";
import type { SubmissionResponseBody } from "../../lib/types";

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

  if (!(await requireHuntStartedApi(res, user.isAdmin))) return;

  const parsedReq = requestBodySchema.safeParse(parseJsonBody(req.body));
  if (!parsedReq.success) {
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

  if (mediaURL != null && mediaURL !== "") {
    const spaces = getSpacesConfig();
    if (!spaces) {
      return respond(400, {
        status: "error",
        message: "Storage not configured on server",
      });
    }

    const mediaURLRegex = new RegExp(
      `^https://${spaces.bucket}\\.${spaces.region}\\.(?:cdn\\.)?digitaloceanspaces\\.com/(.+)/(.+)/(.+)`,
    );
    const match = mediaURL.match(mediaURLRegex);
    if (match == null) {
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
  }

  const updateFields: { mediaURL?: string; note?: string } = {};
  if (mediaURL) {
    updateFields.mediaURL = mediaURL;
  }
  if (note !== undefined) {
    updateFields.note = note;
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: updateFields,
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
