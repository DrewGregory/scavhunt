import { timingSafeEqual } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

function extractApiKey(req: NextApiRequest): string | null {
  const headerKey = req.headers["x-admin-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Agent admin API auth: ADMIN_API_KEY via Bearer or X-Admin-Api-Key.
 * No CSRF / same-origin check (machine clients).
 */
export function requireAdminApiKey(
  req: NextApiRequest,
  res: NextApiResponse,
): boolean {
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!expected) {
    res.status(503).json({ error: "ADMIN_API_KEY is not configured" });
    return false;
  }

  const provided = extractApiKey(req);
  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export function wantsIncludeDeleted(req: NextApiRequest): boolean {
  return req.query.includeDeleted === "1";
}
