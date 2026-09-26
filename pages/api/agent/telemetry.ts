import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminApiKey } from "../../../lib/agentAuth";
import {
  getTelemetryEvents,
  getTelemetrySummary,
  parseTelemetryQuery,
} from "../../../lib/telemetryQueries";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const viewRaw = req.query.view;
  const view = Array.isArray(viewRaw) ? viewRaw[0] : viewRaw;
  if (view !== "summary" && view !== "events") {
    return res.status(400).json({
      error: "Query view must be 'summary' or 'events'",
    });
  }

  try {
    const params = parseTelemetryQuery(req.query);
    if (view === "summary") {
      const summary = await getTelemetrySummary(params);
      return res.status(200).json(summary);
    }
    const result = await getTelemetryEvents(params);
    return res.status(200).json(result);
  } catch (error) {
    console.error("agent telemetry failed", error);
    return res.status(500).json({ error: "Failed to load telemetry" });
  }
}
