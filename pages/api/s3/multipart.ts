import type { NextApiRequest, NextApiResponse } from "next";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";
import { requireApiUser } from "../../../lib/auth";
import { requireHuntStartedApi } from "../../../lib/time";
import { getSpacesConfig } from "../../../lib/s3";

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

  const { challengeId, filename, contentType } = req.body ?? {};
  if (!challengeId || typeof challengeId !== "string") {
    return res.status(400).json({ error: "Missing or invalid challengeId" });
  }

  const spaces = getSpacesConfig();
  if (!spaces) {
    return res.status(500).json({ error: "Storage not configured on server" });
  }

  const extFromFilename = filename?.split(".").pop();
  const fileExt = extFromFilename ?? "";
  if (!fileExt) {
    return res
      .status(400)
      .json({ error: "Missing file extension (provide filename)" });
  }

  const teamId = user.teamId;
  const key = `${challengeId}/${teamId}/${randomBytes(8).toString("hex")}.${fileExt}`;

  try {
    const cmd = new CreateMultipartUploadCommand({
      Bucket: spaces.bucket,
      Key: key,
      ContentType: contentType ?? "application/octet-stream",
    });
    const result = await spaces.client.send(cmd);
    return res.status(200).json({
      uploadId: result.UploadId,
      key,
    });
  } catch (err) {
    console.error("s3 multipart create error", err);
    return res.status(500).json({ error: "Failed to create multipart upload" });
  }
}
