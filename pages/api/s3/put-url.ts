import type { NextApiRequest, NextApiResponse } from "next";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";
import { z } from "zod";
import { requireApiUser, requireHuntAccessApi } from "../../../lib/auth";
import { getSpacesConfig } from "../../../lib/s3";
import {
  attemptIdFromHeaders,
  logServerEvent,
} from "../../../lib/serverTelemetry";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

const bodySchema = z.object({
  challengeId: z.string().min(1).optional(),
  filename: z.string().min(1).max(255),
  contentType: z.string().max(255).optional(),
  purpose: z.enum(["media", "poster"]),
  videoKey: z.string().max(1024).optional(),
  sandbox: z.boolean().optional(),
  runId: z.string().regex(SAFE_SEGMENT).optional(),
  label: z.string().regex(SAFE_SEGMENT).optional(),
});

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

  if (!(await requireHuntAccessApi(res, user))) return;

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { challengeId, filename, purpose, videoKey, sandbox, runId, label } =
    parsed.data;

  let prefix: string;
  if (sandbox) {
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Sandbox uploads are admin-only" });
    }
    if (!runId) {
      return res.status(400).json({ error: "Missing runId for sandbox upload" });
    }
    prefix = `sandbox/${user.id}/${runId}/`;
  } else {
    if (!user.teamId) {
      return res.status(400).json({ error: "You must be on a team to upload" });
    }
    if (!challengeId) {
      return res.status(400).json({ error: "Missing or invalid challengeId" });
    }
    prefix = `${challengeId}/${user.teamId}/`;
  }

  let key: string;
  let contentType: string;
  if (purpose === "poster") {
    if (
      !videoKey ||
      !videoKey.startsWith(prefix) ||
      videoKey.includes("..") ||
      videoKey.length === prefix.length
    ) {
      return res.status(400).json({ error: "Invalid videoKey" });
    }
    key = `${videoKey}.poster.jpg`;
    contentType = "image/jpeg";
  } else {
    const ext = filename.includes(".") ? filename.split(".").pop() ?? "" : "";
    if (!/^[A-Za-z0-9]{1,10}$/.test(ext)) {
      return res
        .status(400)
        .json({ error: "Missing file extension (provide filename)" });
    }
    const name = sandbox && label ? label : randomBytes(8).toString("hex");
    key = `${prefix}${name}.${ext.toLowerCase()}`;
    contentType = parsed.data.contentType || "application/octet-stream";
  }

  const spaces = getSpacesConfig();
  if (!spaces) {
    return res.status(500).json({ error: "Storage not configured on server" });
  }

  try {
    const cmd = new PutObjectCommand({
      Bucket: spaces.bucket,
      Key: key,
      ACL: "public-read",
      ContentType: contentType,
      CacheControl: CACHE_CONTROL,
    });
    // x-amz-acl is hoisted into the query string; Content-Type and
    // Cache-Control are unsigned, so the client must send them itself for the
    // object to get this metadata.
    const url = await getSignedUrl(spaces.client as any, cmd as any, {
      expiresIn: 60 * 15,
    });
    void logServerEvent({
      type: "put_url_signed",
      userId: user.id,
      teamId: user.teamId,
      challengeId: challengeId ?? null,
      attemptId: attemptIdFromHeaders(req.headers),
      sandbox: Boolean(sandbox),
      meta: { key, purpose },
    });
    return res.status(200).json({
      url,
      key,
      publicUrl: spaces.publicUrl(key),
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (err) {
    console.error("s3 put-url error", err);
    return res.status(500).json({ error: "Failed to sign upload URL" });
  }
}
