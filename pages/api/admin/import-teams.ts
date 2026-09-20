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
        const [emoji, name] = record;
        if (!name) continue;

        const previousTeam = await prisma.team.findFirst({
          where: { name },
        });

        if (previousTeam == null) {
          await prisma.team.create({
            data: {
              name,
              emoji: emoji || "❓",
            },
          });
          created++;
        } else {
          await prisma.team.update({
            where: { id: previousTeam.id },
            data: {
              name,
              emoji: emoji || previousTeam.emoji,
            },
          });
          updated++;
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
      return res.status(500).json({ error: "Failed to import teams" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
