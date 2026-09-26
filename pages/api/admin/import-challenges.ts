import { NextApiRequest, NextApiResponse } from "next";
import { parse } from "csv-parse/sync";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";

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
        const row =
          record.length >= 7
            ? [record[0], record[1], record[2], record[4], record[5], record[6]]
            : record;
        const [title, prompt, pts, lat, lng, numWinners] = row;
        if (!title) continue;

        const existing = await prisma.challenge.findFirst({
          where: { title },
        });

        if (existing) {
          await prisma.challenge.update({
            where: { id: existing.id },
            data: {
              title,
              prompt: prompt || " ",
              lat: Number(lat),
              lng: Number(lng),
              pts: Number(pts),
              numWinners: Number(numWinners),
            },
          });
          updated++;
        } else {
          await prisma.challenge.create({
            data: {
              title,
              prompt: prompt || " ",
              lat: Number(lat),
              lng: Number(lng),
              pts: Number(pts),
              numWinners: Number(numWinners),
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
