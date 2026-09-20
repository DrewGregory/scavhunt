import type { NextApiRequest, NextApiResponse } from "next";
import { assertSameOrigin, clearSessionCookie } from "../../../lib/auth";
import { jsonError } from "../../../lib/http";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
