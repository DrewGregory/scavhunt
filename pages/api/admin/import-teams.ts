import { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../../lib/dbConnect";
import { TeamModel } from "../../../models/Team";
import { verifyAdminTeamCode } from "../../../lib/team";
import { parse } from 'csv-parse/sync';
import { randomBytes } from "node:crypto";
import { sha256 } from "../../../lib/hash";

const parseMembers = (membersString: string) => {
  return membersString.split(", ").map(m => {
    const parts = m.trim().split(" ");
    if (parts.length === 1) {
      // Single name - use it as firstName
      return { firstName: parts[0] };
    } else {
      // Multiple parts - first is firstName, rest is familyName
      const firstName = parts[0];
      const familyName = parts.slice(1).join(" ");
      return { firstName, familyName };
    }
  });
};

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
      const newTeamCodes: Array<{ name: string; emoji: string; teamCode: string }> = [];

      for (const record of records) {
        const [emoji, name, _size, membersString] = record;
        const members = parseMembers(membersString);

        const previousTeam = await TeamModel.findOne({ name }).lean().exec();
        
        if (previousTeam == null) {
          // Create new team
          const teamCode = randomBytes(16).toString("hex");
          const teamHash = sha256(teamCode);
          await TeamModel.create({
            teamCode: teamHash,
            name,
            emoji,
            members,
          });
          newTeamCodes.push({ name, emoji, teamCode });
          created++;
        } else {
          // Update existing team
          await TeamModel.findOneAndUpdate(
            { name },
            {
              name,
              emoji,
              members,
            }
          );
          updated++;
        }
      }

      return res.status(200).json({ 
        success: true,
        message: `Import complete: ${created} created, ${updated} updated`,
        created,
        updated,
        newTeamCodes,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to import teams" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

