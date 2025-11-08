import type { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../lib/dbConnect";
import { getTeamFromCookie } from "../../lib/team";
import { SubmissionModel, serializedSubmissionSchema } from "../../models/Submission";
import { serializedTeamSchema } from "../../models/Team";
import { serializedChallengeSchema } from "../../models/Challenge";
import { z } from "zod";

const submissionWithLookupsSchema = serializedSubmissionSchema.merge(
  z.object({
    team: serializedTeamSchema,
    challenge: serializedChallengeSchema,
  })
);

type SerializedSubmissionWithLookups = z.infer<
  typeof submissionWithLookupsSchema
>;

type ResponseData =
  | {
      results: SerializedSubmissionWithLookups[];
    }
  | {
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  await dbConnect();

  const team = await getTeamFromCookie(req.cookies);
  if (team == null) {
    return res.status(401).json({ error: "Not signed in" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const query = req.query.q as string | undefined;
  if (!query || query.trim().length === 0) {
    return res.status(200).json({ results: [] });
  }

  try {
    const submissionsRaw = await SubmissionModel.aggregate([
      {
        $match: {
          mediaURL: {
            $regex: /\.(mpg|mp2|mpeg|mpe|mpv|mov|mp4)$/i,
          },
        },
      },
      {
        $lookup: {
          from: "teams",
          localField: "teamId",
          foreignField: "_id",
          as: "team",
        },
      },
      {
        $lookup: {
          from: "challenges",
          localField: "challengeId",
          foreignField: "_id",
          as: "challenge",
        },
      },
      {
        $unwind: {
          path: "$challenge",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$team",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          $or: [
            { note: { $regex: query, $options: "i" } },
            { "team.name": { $regex: query, $options: "i" } },
            { "challenge.title": { $regex: query, $options: "i" } },
          ],
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $limit: 10,
      },
    ]);

    const submissions = z
      .array(submissionWithLookupsSchema)
      .parse(submissionsRaw);

    return res.status(200).json({ results: submissions });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Search failed" });
  }
}
