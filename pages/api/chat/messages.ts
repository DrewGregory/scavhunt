import type { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../../lib/dbConnect";
import { getTeamFromCookie, isAdminTeam } from "../../../lib/team";
import { z } from "zod";
import { ChatModel, serializedChatSchema, SerializedChat } from "../../../models/Chat";

const postRequestBodySchema = z.object({
  message: z.string().min(1).max(1000),
});

type GetResponseData = {
  messages: SerializedChat[];
} | {
  error: string;
};

type PostResponseData = {
  success: boolean;
  message: SerializedChat;
} | {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponseData | PostResponseData>
) {
  await dbConnect();

  const team = await getTeamFromCookie(req.cookies);
  if (team == null) {
    return res.status(401).json({ error: "Not signed in" });
  }

  if (req.method === "GET") {
    const messages = await ChatModel.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();

    const serializedMessages = messages
      .map((msg) => {
        const parsed = serializedChatSchema.safeParse(msg);
        return parsed.success ? parsed.data : null;
      })
      .filter((msg): msg is SerializedChat => msg !== null)
      .reverse();

    return res.status(200).json({ messages: serializedMessages });
  } else if (req.method === "POST") {
    const parsedReq = postRequestBodySchema.safeParse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body
    );
    if (!parsedReq.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { message } = parsedReq.data;

    const newChat = await ChatModel.create({
      teamId: team._id,
      teamName: team.name,
      message: message,
      isAdmin: isAdminTeam(team._id.toString()),
      createdAt: new Date(),
    });

    const serialized = serializedChatSchema.parse(newChat.toObject());

    return res.status(200).json({
      success: true,
      message: serialized,
    });
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
