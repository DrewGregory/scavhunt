import type { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../../lib/dbConnect";
import { getTeamFromCookie, isAdminTeam } from "../../../lib/team";
import { ScavAIConversationModel } from "../../../models/ScavAIConversation";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  await dbConnect();
  const team = await getTeamFromCookie(req.cookies);

  if (team == null || !isAdminTeam(team._id.toString())) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    // Fetch all conversations sorted by most recent
    const conversations = await ScavAIConversationModel.find({})
      .sort({ updatedAt: -1 })
      .lean();

    // Transform to serializable format
    const serializedConversations = conversations.map((conv) => ({
      _id: conv._id.toString(),
      teamId: conv.teamId.toString(),
      teamName: conv.teamName,
      messageCount: conv.messages.length,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      firstMessage:
        conv.messages.length > 0
          ? conv.messages[0].content.substring(0, 100) + "..."
          : "",
      messages: conv.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
      })),
    }));

    res.status(200).json({ conversations: serializedConversations });
  } catch (error) {
    console.error("Error fetching ScavAI conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
}

