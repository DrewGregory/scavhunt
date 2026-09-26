import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiAdmin } from "../../../../lib/auth";
import {
  getTelemetryEvents,
  parseTelemetryQuery,
} from "../../../../lib/telemetryQueries";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const params = parseTelemetryQuery(req.query);
    const result = await getTelemetryEvents(params);
    return res.status(200).json(result);
  } catch (error) {
    console.error("telemetry events failed", error);
    return res.status(500).json({ error: "Failed to load telemetry events" });
  }
}
