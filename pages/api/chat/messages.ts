import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { requireApiUser } from "../../../lib/auth";
import { parseJsonBody, serializeChatMessage } from "../../../lib/serialize";
import type { SerializedChatMessage } from "../../../lib/types";

const postRequestBodySchema = z.object({
  message: z.string().min(1).max(1000),
});

type GetResponseData =
  | { messages: SerializedChatMessage[] }
  | { error: string };

type PostResponseData =
  | { success: boolean; message: SerializedChatMessage }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponseData | PostResponseData>,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const messages = await prisma.chatMessage.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { team: true },
    });

    return res.status(200).json({
      messages: messages.map(serializeChatMessage).reverse(),
    });
  } else if (req.method === "POST") {
    if (!user.teamId || !user.team) {
      return res.status(400).json({ error: "You must be on a team to chat" });
    }

    const parsedReq = postRequestBodySchema.safeParse(parseJsonBody(req.body));
    if (!parsedReq.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const newChat = await prisma.chatMessage.create({
      data: {
        teamId: user.teamId,
        userId: user.id,
        message: parsedReq.data.message,
        isAdmin: user.isAdmin,
      },
      include: { team: true },
    });

    return res.status(200).json({
      success: true,
      message: serializeChatMessage(newChat),
    });
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
