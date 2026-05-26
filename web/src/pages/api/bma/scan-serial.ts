import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageBase64, imageUrl } = req.body;

  if (!imageBase64 && !imageUrl) {
    return res.status(400).json({ error: "No image provided" });
  }

  try {
    const imageContent: OpenAI.Chat.ChatCompletionContentPartImage = imageBase64
      ? {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "high" },
        }
      : {
          type: "image_url",
          image_url: { url: imageUrl, detail: "high" },
        };

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            imageContent,
            {
              type: "text",
              text: `You are an expert at reading device labels and extracting serial numbers.

Look at this device label image carefully and extract the SERIAL NUMBER.

Rules:
- The serial number is typically a long numeric or alphanumeric string printed prominently on the label
- It may be labeled as: "Serial", "S/N", "SN", "Ser.Nr.", "Seriennummer", or appear as a standalone number under a barcode/QR code
- Do NOT return model numbers, article numbers, order numbers, or part numbers
- In BMA/fire alarm devices, the serial number is usually the long number printed below the 2D barcode/QR code
- Return ONLY the serial number, nothing else - no labels, no explanation
- If you cannot find a clear serial number, return: UNKNOWN

Serial number:`,
            },
          ],
        },
      ],
      max_tokens: 50,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content?.trim() || "UNKNOWN";
    // Clean up: remove common prefixes, whitespace, newlines
    const serialNumber = raw
      .replace(/^(serial\s*(number)?|s\/n|sn|ser\.?\s*nr\.?):?\s*/i, "")
      .replace(/\s+/g, "")
      .trim();

    return res.status(200).json({ 
      serialNumber: serialNumber === "UNKNOWN" ? null : serialNumber,
      raw 
    });
  } catch (err: any) {
    console.error("scan-serial error:", err);
    return res.status(500).json({ error: err.message || "Failed to scan serial number" });
  }
}
