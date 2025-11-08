import { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../../lib/dbConnect";
import { ChallengeModel } from "../../../models/Challenge";
import { verifyAdminTeamCode } from "../../../lib/team";
import { parse } from 'csv-parse/sync';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await dbConnect();

  const teamCode = req.cookies.teamCode;
  if (!teamCode || !(await verifyAdminTeamCode(teamCode))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "POST") {
    try {
      const body = JSON.parse(req.body);
      const { csvContent } = body;

      if (!csvContent) {
        return res.status(400).json({ error: "Missing CSV content" });
      }

      // Parse CSV content
      const records = parse(csvContent, {
        from_line: 2, // Skip header
      });

      let updated = 0;
      let created = 0;

      for (const record of records) {
        const [title, prompt, pts, _full, lat, lng, numWinners] = record;
        
        const result = await ChallengeModel.findOneAndUpdate(
          { title },
          {
            title,
            prompt: prompt || " ",
            loc: {
              lat: Number(lat),
              lng: Number(lng),
            },
            pts: Number(pts),
            numWinners: Number(numWinners),
          },
          {
            upsert: true,
            new: true,
          }
        );

        if (result) {
          // Check if it was an update or create by checking if the document existed
          const existing = await ChallengeModel.findOne({ 
            title,
            _id: { $ne: result._id }
          });
          if (existing) {
            updated++;
          } else {
            created++;
          }
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

