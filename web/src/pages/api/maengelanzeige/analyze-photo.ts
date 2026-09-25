import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import OpenAI from "openai";

export const config = {
  api: { bodyParser: { sizeLimit: "15mb" } },
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = createServerSupabaseClient(req);
    if (!result.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { imageBase64, imageUrl, itemContext } = req.body || {};

  if (!imageBase64 && !imageUrl) {
    return res.status(400).json({ error: "No image provided" });
  }

  try {
    const imageContent: OpenAI.Chat.ChatCompletionContentPartImage = imageBase64
      ? {
          type: "image_url",
          image_url: {
            url: imageBase64.startsWith("data:")
              ? imageBase64
              : `data:image/jpeg;base64,${imageBase64}`,
            detail: "high",
          },
        }
      : {
          type: "image_url",
          image_url: { url: imageUrl, detail: "high" },
        };

    const contextPrompt = itemContext
      ? `Original Mängelanzeige item context: "${itemContext}".`
      : "";

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an objective construction site documentation specialist.
Analyze this photo from a construction site inspection / defect verification.

Strict Rules:
- Describe clearly, factually, and concisely in GERMAN what is visible in the photo regarding the building element, defect, or completed work.
- DO NOT invent or hallucinate information, dates, or details not visible in the image.
- Keep the description to 1-2 concise sentences (e.g., "Beschädigte Oberfläche im Bereich der Türzarge.", "Fachgerecht montierte Steckdose mit Abdeckung.", "Kabeldurchführung ordnungsgemäß abgedichtet.").
- Return ONLY the description text in German, nothing else.`,
        },
        {
          role: "user",
          content: [
            imageContent,
            {
              type: "text",
              text: `${contextPrompt} Please analyze the image and generate a factual description:`,
            },
          ],
        },
      ],
      max_tokens: 150,
      temperature: 0.2,
    });

    const description = response.choices[0]?.message?.content?.trim() || "";

    return res.status(200).json({
      ok: true,
      description,
    });
  } catch (error: any) {
    console.error("[Mängelanzeige Photo Analysis Error]:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to analyze photo with AI",
    });
  }
}
