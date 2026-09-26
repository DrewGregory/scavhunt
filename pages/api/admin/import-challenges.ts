import { NextApiRequest, NextApiResponse } from "next";
import { parse } from "csv-parse/sync";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";

function parseEnabledCell(raw: string | undefined): boolean {
  if (raw == null || String(raw).trim() === "") return false;
  const v = String(raw).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "enabled") return true;
  if (v === "false" || v === "0" || v === "no" || v === "disabled") return false;
  return false;
}

/**
 * CSV columns (header row skipped):
 * title, prompt, pts, [optional unused], lat, lng, numWinners[, enabled]
 * Legacy 6-col rows without enabled → created as enabled:false.
 * 7+ col with enabled at index 6 (after remapping) or last cell.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiAdmin(req, res);
  if (!user) return;

  if (req.method === "POST") {
    try {
      const body = parseJsonBody(req.body) as { csvContent?: string };
      const { csvContent } = body;

      if (!csvContent) {
        return res.status(400).json({ error: "Missing CSV content" });
      }

      const records = parse(csvContent, {
        from_line: 2,
      }) as string[][];

      let updated = 0;
      let created = 0;

      for (const record of records) {
        // Support both legacy wide rows and simple rows.
        let title: string;
        let prompt: string;
        let pts: string;
        let lat: string | undefined;
        let lng: string | undefined;
        let numWinners: string;
        let enabledRaw: string | undefined;

        if (record.length >= 8) {
          // title, prompt, pts, unused, lat, lng, numWinners, enabled
          title = record[0];
          prompt = record[1];
          pts = record[2];
          lat = record[4];
          lng = record[5];
          numWinners = record[6];
          enabledRaw = record[7];
        } else if (record.length >= 7) {
          // title, prompt, pts, unused, lat, lng, numWinners  OR
          // title, prompt, pts, lat, lng, numWinners, enabled
          const maybeEnabled = record[6];
          const looksLikeEnabled =
            /^(true|false|1|0|yes|no|enabled|disabled)$/i.test(
              String(maybeEnabled).trim(),
            );
          if (looksLikeEnabled && record.length === 7) {
            title = record[0];
            prompt = record[1];
            pts = record[2];
            lat = record[3];
            lng = record[4];
            numWinners = record[5];
            enabledRaw = record[6];
          } else {
            title = record[0];
            prompt = record[1];
            pts = record[2];
            lat = record[4];
            lng = record[5];
            numWinners = record[6];
            enabledRaw = undefined;
          }
        } else {
          [title, prompt, pts, lat, lng, numWinners, enabledRaw] = record;
        }

        if (!title) continue;

        const parseCoord = (v: string | undefined) => {
          if (v == null || String(v).trim() === "") return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const latN = parseCoord(lat);
        const lngN = parseCoord(lng);
        const enabled = parseEnabledCell(enabledRaw);

        const existing = await prisma.challenge.findFirst({
          where: { title, deletedAt: null },
        });

        if (existing) {
          await prisma.challenge.update({
            where: { id: existing.id },
            data: {
              title,
              prompt: prompt || " ",
              lat: latN,
              lng: lngN,
              pts: Number(pts),
              numWinners: Number(numWinners),
              ...(enabledRaw != null && String(enabledRaw).trim() !== ""
                ? { enabled }
                : {}),
            },
          });
          updated++;
        } else {
          await prisma.challenge.create({
            data: {
              title,
              prompt: prompt || " ",
              lat: latN,
              lng: lngN,
              pts: Number(pts),
              numWinners: Number(numWinners),
              enabled,
            },
          });
          created++;
        }
      }

      return res.status(200).json({
        success: true,
        message: `Import complete: ${created} created, ${updated} updated`,
        created,
        updated,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to import challenges" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
