import type { NextApiRequest, NextApiResponse } from "next";
import { SubmissionModel } from "../../models/Submission";
import { Types } from "mongoose";
import assert from "assert";
import { dbConnect } from "../../lib/dbConnect";
import { SubmissionResponseBody } from "../../lib/types";
import { isAdminTeam, getTeamFromCookie } from "../../lib/team";
import { PutObjectAclCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from 'zod';

const requestBodySchema = z.object({
  submissionId: z.string(), 
  note: z.string().optional(),
  mediaURL: z.string().optional(),
  challengeId: z.string(),
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
  const { submissionId, note, mediaURL, challengeId } = parsedReq.data;

  // Validate submission exists
  const submission = await SubmissionModel.findOne({
    _id: new Types.ObjectId(submissionId),
  })
    .lean()
    .exec();
  
  if (submission == null || Array.isArray(submission)) {
    return respond(400, {
      status: "error",
      message: `Submission with id '${submissionId}' not found`,
    });
  }

  // Check if the user is admin OR the original submitter
  const isAdmin = isAdminTeam(teamId);
  const isOriginalSubmitter = submission.teamId.toString() === teamId;
  
  if (!isAdmin && !isOriginalSubmitter) {
    return respond(400, {
      status: "error",
      message: "You don't have permission to update this submission",
    });
  }

  // Check that we have something to update
  if (!mediaURL && !note) {
    return respond(400, {
      status: "error",
      message: "Please provide either a file or a note to update",
    });
  }

  // If mediaURL is provided, validate it and set ACL
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
      return respond(400, {
        status: "error",
        message: "Invalid media URL - mismatch with challenge or team ID"
      });
    }
    
    const key = `${challengeId}/${teamId}/${fileName}`;
    try {
      await client.send(new PutObjectAclCommand({
        Bucket: bucket,
        Key: key,
        ACL: "public-read",
      }));
    } catch (error) {
      console.error("Error setting ACL:", error);
      return respond(400, {
        status: "error",
        message: "Failed to set file permissions. Try again.",
      });
    }
  }

  // Build update object
  const updateFields: { mediaURL?: string; note?: string } = {};
  if (mediaURL) {
    updateFields.mediaURL = mediaURL;
  }
  if (note !== undefined) {
    updateFields.note = note;
  }

  // Update the submission
  await SubmissionModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(submissionId),
    },
    updateFields
  ).exec();
  
  return respond(200, {
    status: "success",
    submissionId: submissionId,
    message: mediaURL && note ? "Video and note updated successfully" : 
             mediaURL ? "Video uploaded successfully" : 
             "Note updated successfully",
  });

};
