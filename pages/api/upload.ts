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
  const parsedReq = requestBodySchema.safeParse(parseJsonBody(req.body));
  if (!parsedReq.success) {
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
    if (challengeIdFromUrl !== challengeId || teamIdFromUrl !== teamId) {
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
    },
  });

  return respond(200, {
    status: "success",
    submissionId: submission.id,
    message: "Submission uploaded successfully",
  });
}
