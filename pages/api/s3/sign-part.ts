import type { NextApiRequest, NextApiResponse } from "next";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireApiUser, requireHuntAccessApi } from "../../../lib/auth";
import { getSpacesConfig } from "../../../lib/s3";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireApiUser(req, res);
  if (!user) return;

  if (!(await requireHuntAccessApi(res, user))) return;

  const { uploadId, key, partNumber } = req.query;
  if (
    typeof uploadId !== "string" ||
    typeof key !== "string" ||
    typeof partNumber !== "string"
  ) {
    return res
      .status(400)
      .json({ error: "Missing uploadId, key, or partNumber" });
  }

  const partNum = parseInt(partNumber, 10);
  if (Number.isNaN(partNum) || partNum < 1) {
    return res.status(400).json({ error: "Invalid partNumber" });
  }

  const spaces = getSpacesConfig();
  if (!spaces) {
    return res.status(500).json({ error: "Storage not configured on server" });
  }

  let expiresIn = 60 * 15;
  const requested = Number(req.query.expiresIn);
  if (
    req.query.expiresIn !== undefined &&
    Number.isFinite(requested) &&
    user.isAdmin &&
    key.startsWith(`sandbox/${user.id}/`)
  ) {
    expiresIn = Math.min(3600, Math.max(30, Math.round(requested)));
  }

  try {
    const cmd = new UploadPartCommand({
      Bucket: spaces.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNum,
    });
    const url = await getSignedUrl(spaces.client as any, cmd as any, {
      expiresIn,
    });
    return res.status(200).json({ url, headers: {} });
  } catch (err) {
    console.error("s3 multipart sign-part error", err);
    return res.status(500).json({ error: "Failed to sign part URL" });
  }
}
