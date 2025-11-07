import type { NextApiRequest, NextApiResponse } from "next";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getTeamFromCookie } from "../../lib/team";
import { randomBytes } from "crypto";

type PresignedRequestBody = {
  challengeId?: string;
  filename?: string; // original filename, used to derive extension
  fileType?: string; // alternative to filename
  contentType?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const team = await getTeamFromCookie(req.cookies as Record<string, string | undefined>);
  if (!team) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body ?? {}) as PresignedRequestBody;
  const { challengeId, filename, fileType, contentType } = body;
  if (!challengeId || typeof challengeId !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'challengeId' in request body" });
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

  // determine file extension same way upload.ts does
  const extFromFilename = filename?.split(".").pop();
  const fileExt = (fileType ?? extFromFilename ?? "") as string;
  if (!fileExt) {
    return res.status(400).json({ error: "Missing file extension (provide filename or fileType)" });
  }

  const teamId = team._id?.toHexString?.() ?? (team._id as unknown as string);
  const key = `${challengeId}/${teamId}/${randomBytes(8).toString("hex")}.${fileExt}`;

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ACL: "public-read",
    ContentType: contentType ?? "application/octet-stream",
  });

  try {
    // cast to any to avoid TS middleware generic mismatch
    const url = await getSignedUrl(client as any, cmd as any, { expiresIn: 60 * 15 });
    const publicUrl = `https://${bucket}.${spacesRegion}.cdn.digitaloceanspaces.com/${encodeURIComponent(key)}`;
    return res.status(200).json({ url, publicUrl, key });
  } catch (err) {
    console.error("presigned-url error", err);
    return res.status(500).json({ error: "Failed to generate presigned url" });
  }
}
