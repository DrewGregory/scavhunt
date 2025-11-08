import type { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../../lib/dbConnect";
import { getTeamFromCookie } from "../../../lib/team";
import { z } from "zod";
import { ChatModel, serializedChatSchema, SerializedChat } from "../../../models/Chat";
import { Types } from "mongoose";

const postRequestBodySchema = z.object({
  message: z.string().min(1).max(1000),
  threadId: z.string().optional(),
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
    const threadId = req.query.threadId as string | undefined;

    const filter: any = {};
    if (threadId) {
      // If threadId is provided, only get messages for that thread
      filter.threadId = new Types.ObjectId(threadId);
    }
    // If no threadId, get all messages (both general and video comments)

    const messages = await ChatModel.find(filter)
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

    const { message, threadId } = parsedReq.data;

    const chatData: any = {
      teamId: team._id,
      teamName: team.name,
      message: message,
      createdAt: new Date(),
    };

    if (threadId) {
      chatData.threadId = new Types.ObjectId(threadId);
    }

    const newChat = await ChatModel.create(chatData);

    const serialized = serializedChatSchema.parse(newChat.toObject());

    return res.status(200).json({
      success: true,
      message: serialized,
    });
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
