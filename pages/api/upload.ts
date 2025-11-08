import type { NextApiRequest, NextApiResponse } from "next";
import { SubmissionModel } from "../../models/Submission";
import { ChallengeModel } from "../../models/Challenge";
import { Types } from "mongoose";
import assert from "assert";
import { dbConnect } from "../../lib/dbConnect";
import { SubmissionResponseBody } from "../../lib/types";
import { getTeamFromCookie } from "../../lib/team";
import { PutObjectAclCommand, PutObjectCommand, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { NextApiRequestCookies } from "next/dist/server/api-utils";
import { randomBytes } from "crypto";
import { z } from 'zod';

const requestBodySchema = z.object({
  challengeId: z.string(), 
  note: z.string(),
  mediaURL: z.string().optional(),
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
  const { challengeId, note, mediaURL } = parsedReq.data;

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

  if (mediaURL != null) {
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

    const mediaURLRegex = new RegExp(`^https://${bucket}\\.${process.env.SPACES_REGION}\\.cdn\\.digitaloceanspaces\\.com/(.+)/(.+)/(.+)`);
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

