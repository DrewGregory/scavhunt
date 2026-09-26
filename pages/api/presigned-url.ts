import type { NextApiRequest, NextApiResponse } from "next";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";
import { requireApiUser } from "../../lib/auth";
import { requireHuntStartedApi } from "../../lib/time";

type PresignedRequestBody = {
  challengeId?: string;
  filename?: string;
  contentType?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireApiUser(req, res);
  if (!user) return;

  if (!(await requireHuntStartedApi(res, user.isAdmin))) return;

  if (!user.teamId) {
    return res.status(400).json({ error: "You must be on a team to upload" });
  }

  const body = (req.body ?? {}) as PresignedRequestBody;
  const { challengeId, filename, contentType } = body;
  if (!challengeId || typeof challengeId !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid 'challengeId' in request body" });
  }

  const bucket = process.env.SPACES_BUCKET_NAME;
  const spacesRegion = process.env.SPACES_REGION;
  const endpoint = process.env.SPACES_ENDPOINT;
  const accessKey = process.env.SPACES_KEY;
  const secret = process.env.SPACES_SECRET;

  if (!bucket || !spacesRegion || !endpoint || !accessKey || !secret) {
    return res.status(500).json({ error: "Storage not configured on server" });
  }

  const client = new S3Client({
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secret,
    },
    region: spacesRegion,
    endpoint,
    forcePathStyle: false,
  });

  const extFromFilename = filename?.split(".").pop();
  const fileExt = extFromFilename ?? "";
  if (!fileExt) {
    return res
      .status(400)
      .json({ error: "Missing file extension (provide filename or fileType)" });
  }

  const teamId = user.teamId;
  const key = `${challengeId}/${teamId}/${randomBytes(8).toString("hex")}.${fileExt}`;

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ACL: "public-read",
    ContentType: contentType ?? "application/octet-stream",
  });

  try {
    const url = await getSignedUrl(client as any, cmd as any, {
      expiresIn: 60 * 15,
    });
    const publicUrl = `https://${bucket}.${spacesRegion}.cdn.digitaloceanspaces.com/${encodeURIComponent(key)}`;
    return res.status(200).json({ url, publicUrl, key });
  } catch (err) {
    console.error("presigned-url error", err);
    return res.status(500).json({ error: "Failed to generate presigned url" });
  }
}
