import type { NextApiRequest, NextApiResponse } from "next";
import { SubmissionModel } from "../../models/Submission";
import assert from "assert";
import { dbConnect } from "../../lib/dbConnect";
import { SubmissionResponseBody } from "../../lib/types";
import { getTeamFromCookie } from "../../lib/team";
import { PutObjectAclCommand, PutObjectCommand, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { z } from 'zod';

const requestBodySchema = z.object({
  challengeId: z.string(), 
  note: z.string(),
  mediaURL: z.string().optional(),
  skipUpload: z.boolean().optional(),
});

export default async (req: NextApiRequest, res: NextApiResponse) => {

  await dbConnect();

  const respond = (status: number, body: SubmissionResponseBody) => {
    res.status(status).json(body);
  }

  const team = await getTeamFromCookie(req.cookies);
  if (team == null) {
    return res.status(400).json({ error: "Not signed in "});
  }

  const teamId = team._id.toHexString();
  const parsedReq = requestBodySchema.safeParse(JSON.parse(req.body));
  if (!parsedReq.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { challengeId, note, mediaURL, skipUpload } = parsedReq.data;

  if (note == null || note === "") {
    return {
      status: "error",
      message: "Please provide a note",
    };
  }

  if (
    challengeId == null ||
    challengeId === ""
  ) {
    return {
      status: "error",
      message: "Please provide challengeId",
    };
  }

  // If skip upload is enabled, we don't need mediaURL
  if (!skipUpload && (mediaURL == null || mediaURL === "")) {
    return respond(400, {
      status: "error",
      message: "Please upload a file or check 'Skip upload'",
    });
  }

  if (mediaURL != null && mediaURL !== "") {
    const spacesKey = process.env.SPACES_KEY;
    assert(spacesKey != null);
    const spacesSecret = process.env.SPACES_SECRET;
    assert(spacesSecret != null);
    const spacesRegion = process.env.SPACES_REGION;
    assert(spacesRegion != null);
    const bucket = process.env.SPACES_BUCKET_NAME; 
    assert(bucket != null);
    const spacesEndpoint = process.env.SPACES_ENDPOINT;
    assert(spacesEndpoint != null);

    const client = new S3Client({
    credentials: {
      accessKeyId: spacesKey,
      secretAccessKey: spacesSecret,
    },
    region: spacesRegion,
    endpoint: spacesEndpoint,
    forcePathStyle: false,
  });

    const mediaURLRegex = new RegExp(`^https://${bucket}\\.${process.env.SPACES_REGION}\\.digitaloceanspaces\\.com/(.+)/(.+)/(.+)`);
    const match = mediaURL.match(mediaURLRegex);
    if (match == null) {
      return respond(400, {
        status: "error",
        message: "Invalid mediaURL format",
      });
    }
    const [, challengeIdFromUrl, teamIdFromUrl, fileName] = match;
    if (challengeIdFromUrl !== challengeId || teamIdFromUrl !== teamId) {
      return res.status(400).json({
        status: "error",
        message: "Invalid media URL"
      })
    }
    
    const key = `${challengeId}/${teamId}/${fileName}`;
    await client.send(new PutObjectAclCommand({
      Bucket: bucket,
      Key: key,
      ACL: "public-read",
    }));
  }


  const submission = await SubmissionModel.create({
    teamId,
    challengeId,
    accepted: false,
    mediaURL,
    note,
    createdAt: new Date(),
  });
  return respond(200, {
    status: "success",
    submissionId: submission._id.toHexString(),
    message: "Submission uploaded successfully",
  });

};

