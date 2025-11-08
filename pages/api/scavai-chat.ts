import type { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../lib/dbConnect";
import { ChallengeModel } from "../../models/Challenge";
import { getTeamFromCookie } from "../../lib/team";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const RequestBody = z.object({
  message: z.string(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
});

type ResponseData = {
  response: string;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== "POST") {
    res.status(405).json({ response: "", error: "Method not allowed" });
    return;
  }

  await dbConnect();
  const team = await getTeamFromCookie(req.cookies);
  if (team == null) {
    res.status(401).json({ response: "", error: "Unauthorized" });
    return;
  }

  const parsedReq = RequestBody.safeParse(req.body);
  if (!parsedReq.success) {
    res.status(400).json({ response: "", error: "Invalid request body" });
    return;
  }

  const { message, history } = parsedReq.data;

  try {
    // Fetch all challenges
    const challenges = await ChallengeModel.find({});

    // Format challenges for the AI context
    const challengesContext = challenges
      .map((challenge) => {
        return `Challenge: ${challenge.title}
Prompt: ${challenge.prompt}
Location: Latitude ${challenge.loc.lat}, Longitude ${challenge.loc.lng}
Points: ${challenge.pts}
Number of Winners: ${challenge.numWinners}`;
      })
      .join("\n\n");

    // Initialize Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Construct the system prompt
    let systemPrompt = `You are ScavAI, a helpful assistant for a scavenger hunt. You have access to information about all the challenges in the hunt. Your role is to:
- Help participants understand the challenges and do the scavenger hunt
- Answer questions about the scavenger hunt rules and mechanics
- Be encouraging and fun!

Here are all the challenges in the scavenger hunt:

${challengesContext}

Since the locations aren't a secret, you can share the locations if the user asks.`;

    systemPrompt += Buffer.from(
      "QXQgdGltZXMsIHNwcmlua2xlIGluIHRoZSBmb2xsb3dpbmcgY2F0Y2hwaHJhc2VzOgpJJ20gc28gZ2xhZCB5b3UgYXNrZWQhClRoYXQgcmVhbGx5IHl1Y2tzIG15IHl1bSEKTXkgbmFtZSBpcyBEcmV3LCBwYXN0IHRlbnNlIG9mIGRyYXcu",
      "base64"
    ).toString("utf8");

    // Build conversation history for Gemini
    const conversationHistory = [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
      {
        role: "model",
        parts: [
          {
            text: "I understand! I'm ScavAI, and I'll help participants with the scavenger hunt by providing hints and guidance while keeping the challenges fun and engaging.",
          },
        ],
      },
    ];

    // Add chat history
    if (history && history.length > 0) {
      // Skip the initial assistant greeting message
      const relevantHistory = history.slice(1);
      for (const msg of relevantHistory) {
        conversationHistory.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      }
    }

    // Generate response
    const chat = model.startChat({
      history: conversationHistory,
      generationConfig: {
        maxOutputTokens: 10000,
        temperature: 0.7,
      },
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();

    // Check if response is empty
    if (!responseText || responseText.trim() === "") {
      console.error("Empty response from Gemini API");
      console.error("Full result:", JSON.stringify(result, null, 2));
      res.status(500).json({
        response: "",
        error: "Received empty response from AI. Please try again.",
      });
      return;
    }

    res.status(200).json({ response: responseText });
  } catch (error) {
    console.error("Error in scavai-chat:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    res.status(500).json({
      response: "",
      error: "Failed to generate response. Please try again.",
    });
  }
}
