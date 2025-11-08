import { dbConnect } from "../lib/dbConnect";
import { ChallengeModel} from "../models/Challenge";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { parse } from 'csv-parse/sync';
import { TeamModel } from "../models/Team";
import { randomBytes } from "node:crypto";
import { sha256 } from "../lib/hash";
import { ScavAIConversationModel } from "../models/ScavAIConversation";
import { ChatModel } from "../models/Chat";
import { SubmissionModel } from "../models/Submission";

const recordsSchema = z.array(
  z.array(z.string())
)

const updateChallengesFromCSV = async () => {
  const csv = parse(await readFile("scripts/challenges.csv"), {
    from_line: 2,
  });
  const records = recordsSchema.parse(csv);
  for (const record of records) {
    const [title, prompt, pts, _full, lat, lng, numWinners] = record;    
    await ChallengeModel.findOneAndUpdate(
      {
        title,  
      },
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
      }
    );
  }
};


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
}

export const updateTeamsFromCSV = async () => {
  const csv = parse(await readFile("scripts/teams.csv"), {
    from_line: 2,
  })
  const records = recordsSchema.parse(csv);
  for (const record of records) {
    const [emoji, name, _size, membersString] = record;
    const members = parseMembers(membersString);
    const previousTeam = await TeamModel.findOne({
      name,
    }).lean().exec();
    if (previousTeam == null) {
      const teamCode = randomBytes(16).toString("hex");
      const teamHash = sha256(teamCode);
      const d = await TeamModel.create({
        teamCode: teamHash,
        name,
        emoji,
        members,
      });
      console.log(name, "TEAM CODE", teamCode, "ID", d._id.toHexString());
    } else {
      await TeamModel.findOneAndUpdate({
        name,
      }, {
        name,
        emoji,
        members,
      })
    }
  }
}

const dropDB = async () => {
  await SubmissionModel.deleteMany({});
  await ChallengeModel.deleteMany({});
  await TeamModel.deleteMany({});
  await ChatModel.deleteMany({});
  await ScavAIConversationModel.deleteMany({});
}


if (require.main === module) {
  (async () => {
    console.log("Connecting to DB");
    await dbConnect();
    // await dropDB();
    await updateChallengesFromCSV();
    await updateTeamsFromCSV();
    console.log("Migration complete.");
    process.exit(0)
  })();
}