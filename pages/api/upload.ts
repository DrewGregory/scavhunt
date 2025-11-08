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
    assert(process.env.SPACES_SECRET != null);
    const spacesSecret = process.env.SPACES_SECRET;
    assert(spacesSecret != null);
    const spacesRegion = process.env.SPACES_REGION;
    assert(spacesRegion != null);
    const bucket = process.env.SPACES_BUCKET_NAME; 
    assert(bucket != null);
    const spacesEndpoint = process.env.SPACES_ENDPOINT;
    assert(spacesEndpoint != null);

    const mediaURLRegex = new RegExp(`^https://${bucket}\\.${process.env.SPACES_REGION}\\.cdn\\.digitaloceanspaces\\.com/(.+)/(.+)/(.+)`);

    
    const params: PutObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Body: fileStream,
      ContentType: mimetype,
    };
  }

  const client = new S3Client({
    credentials: {
      accessKeyId: process.env.SPACES_KEY,
      secretAccessKey: process.env.SPACES_SECRET,
    },
    region: process.env.SPACES_REGION,
    endpoint: process.env.SPACES_ENDPOINT,
    forcePathStyle: false,
  });

  
  await client.send(new PutObjectCommand(params));
  await client.send(new PutObjectAclCommand({
    Bucket: bucket,
    Key: key,
    ACL: "public-read",
  }));

  
  
  if (!skipUpload) {
    const fileValidation = validateFile({
      files,
    })
    if (fileValidation.status === "error") {
      const { status, message } = fileValidation;
      return respond(400, {
        status, message,
      });
    }
    const { file, mimetype } = fileValidation;
    
    
    
    const fileType = file.originalFilename?.split(".").pop() ?? "'''";
    const key = `${challengeId}/${teamId}/${randomBytes(8).toString("hex")}.${fileType}`;
    mediaURL = `https://${bucket}.${spacesRegion}.cdn.digitaloceanspaces.com/${key}`;
    try {
      await uploadSubmission({
        file,
        mimetype,
        bucket,
        key,
      });
    } catch (error: unknown) {
      console.error(error);
      return respond(400, {
        status: "error",
        message: "Failed to upload file. Try again or skip upload and send us the file elsewhere",
      });
    }
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

