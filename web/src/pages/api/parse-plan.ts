import { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

// Force @vercel/nft to bundle pdfjs-dist but hide it from Turbopack early execution

// DOMMatrix Polyfill for Node.js (required by pdfjs-dist in Node environment)
if (typeof global.DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(arg: any) {
      if (typeof arg === 'string') return;
      if (Array.isArray(arg)) {
        this.a = arg[0]; this.b = arg[1]; this.c = arg[2];
        this.d = arg[3]; this.e = arg[4]; this.f = arg[5];
      }
    }
  };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    const result = createServerSupabaseClient(req);
    supabase = result.client;
    if (!result.userId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { message: "Method Not Allowed" } });
  }

  try {
    const { fileData, fileName } = req.body;
    if (!fileData) {
      return res.status(400).json({ ok: false, error: { message: "Missing fileData" } });
    }

    const buffer = Buffer.from(fileData, 'base64');
    try {
      const scratchDir = "/home/sebretu/building-task-manager/web/scratch";
      const fs = require('fs');
      const path = require('path');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }
      fs.writeFileSync(path.join(scratchDir, "last_plan.pdf"), buffer);
    } catch (err) {
      console.error("Failed to write last_plan pdf:", err);
    }

    const data = new Uint8Array(buffer);
    const pdfjsPath = "pdfjs-dist/legacy/build/pdf.mjs";
    const pdfjs = await import(pdfjsPath);
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;

    let fullText = "";
    
    // Extract text page by page (limit to first 15 pages to keep context size reasonable)
    const maxPages = Math.min(pdf.numPages, 15);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];
      
      // Group items into lines using vertical Y tolerance of 3.0
      const lines: Array<{ y: number; items: any[] }> = [];
      const sortedItems = [...items]
        .filter(item => item.str && item.str.trim() !== "")
        .sort((a, b) => b.transform[5] - a.transform[5]);

      for (const item of sortedItems) {
        const itemY = item.transform[5];
        let foundLine = lines.find(line => Math.abs(line.y - itemY) <= 3.0);
        if (foundLine) {
          foundLine.items.push(item);
        } else {
          lines.push({ y: itemY, items: [item] });
        }
      }

      // Sort lines from top to bottom
      lines.sort((a, b) => b.y - a.y);

      let pageText = "";
      for (const line of lines) {
        // Sort items in the line from left to right
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);

        // Group close items horizontally into phrases using gap <= 30
        const phrases: Array<{ text: string; x: number; lastX: number }> = [];
        let currentPhrase: { text: string; x: number; lastX: number } | null = null;

        for (const item of line.items) {
          const x = item.transform[4];
          if (!currentPhrase) {
            currentPhrase = { text: item.str, x: x, lastX: x };
          } else {
            if (x - currentPhrase.lastX <= 30.0) {
              currentPhrase.text += " " + item.str;
              currentPhrase.lastX = x;
            } else {
              phrases.push(currentPhrase);
              currentPhrase = { text: item.str, x: x, lastX: x };
            }
          }
        }
        if (currentPhrase) {
          phrases.push(currentPhrase);
        }

        const lineStr = phrases.map(p => `[x:${Math.round(p.x)}] "${p.text}"`).join("  ");
        pageText += lineStr + "\n";
      }
      
      fullText += `--- Page ${i} ---\n` + pageText + "\n";
    }

    // Limit fullText to 40,000 characters to prevent hitting token limits
    fullText = fullText.slice(0, 40000);

    try {
      const scratchDir = "/home/sebretu/building-task-manager/web/scratch";
      const fs = require('fs');
      const path = require('path');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }
      fs.writeFileSync(path.join(scratchDir, "last_extracted_text.txt"), fullText, "utf-8");
    } catch (err) {
      console.error("Failed to write last_extracted_text:", err);
    }

    if (fullText.trim().length < 50) {
      return res.status(200).json({
        ok: true,
        data: [],
        message: "No text found in PDF (scanned image or empty plan). Feel free to add fuses manually."
      });
    }

    // Call OpenAI to structure the text
    const prompt = `You are a professional German electrical engineering AI assistant.
Analyze the following text extracted from an electrical distribution board schematic diagram.
Each text segment is prefixed with its approximate horizontal coordinate on the page, like [x:126] "1F1.1".
Use the horizontal coordinate [x:...] to accurately align fuses, characteristics, ratings, and descriptions into columns.
For example, items on the same page with similar X coordinates belong to the same column/circuit.

CRITICAL COLUMN ALIGNMENT RULE (Hager CAD standard layout):
1. The drawing has standard columns spaced by ~113 units horizontally.
2. Fuses are labeled on the left of their vertical column line, so the fuse label coordinate (e.g. [x:86] "1F1.1" or [x:200] "2F2.1") is shifted left by ~52 units from the column center.
3. The load description (e.g. "Steckdosen Untertischgerät"), cable designation (e.g. "W12"), and terminal name (e.g. "2X2") of that same column are aligned with or slightly to the right of the column line, meaning they have X coordinates around (X_fuse + 50) to (X_fuse + 80).
4. Therefore, to find the description and cable for a fuse:
   - For a fuse at [x:200] (like "2F2.1"), look for text items on the same page with X coordinates in the range of 230 to 280 (like [x:250] "Steckdosen Untertischgerät" and [x:247] "W12").
   - For a fuse at [x:313] (like "2F2.2"), look for text items with X coordinates in the range of 340 to 395 (like [x:363] "Steckdosen Kühlschrank / Kaffemaschine" and [x:360] "W13").
   - Do NOT align a fuse at [x:200] with a description at [x:363]!

CRITICAL PROCESSING INSTRUCTIONS:
1. Process the text PAGE-BY-PAGE. Go page-by-page from Page 1 to the end. Fuses and descriptions are grouped on the same page. Do NOT mix descriptions or characteristics from Page 3 into fuses on Page 5 or Page 6!
2. DO NOT SKIP ANY FUSES/CIRCUITS. Every fuse designation (like 1F1, 1F1.1, 1F1.2, 1F2.1, 2F1, 2F1.1, 3F1, 3F1.1, 4F1, 4F1.1, etc.) found in the text MUST be present in the output array.
3. Be extremely careful with sequential lists of fuses (e.g., 2F2.1, 2F2.2, 2F2.3, 2F2.4, 2F2.5, 2F2.6). You MUST extract ALL of them in the sequence. Do not truncate the list early.
4. RCD association:
   - An RCD (like "2Q1" or "2Q2") protects all branch circuit fuses that are on the same page and share the group prefix (e.g. RCD "2Q1" protects all "2F1.x" fuses on that page; RCD "2Q2" protects all "2F2.x" fuses on that page). Set "rcd": true for these branch circuit fuses.
   - Do NOT return group RCDs (like "2Q1", "2Q2") in the output fuses array. Only return individual circuit fuses/breakers.
5. Determine if the circuit is 3-phase (Drehstrom):
   - Set "phases": 3 if the text above the fuse says "1 3 5" or "1 3" (indicating multi-pole).
   - Set "phases": 3 if the cable cross-section has 5 conductors (e.g. "1x5x10", "1x5x4", "5x16").
   - Set "phases": 3 for typical 3-phase loads (e.g. Herd, CEE, Wallbox, Durchlauferhitzer, Hebeanlage, Lufterhitzer).
   - Otherwise, set "phases": 1.
6. Reconstruct descriptions from their columns:
   - NEVER output internal product codes or models (such as "MBN", "MCN", "CDA", "ADS", "MCN", "HAB") as descriptions. Reconstruct the actual functional description (e.g., "Steuersicherung Beleuchtung" or "Steuersicherung").
   - NEVER output group RCD descriptions (like "Fehlerstromschutzschalter 63A - 30mA") as the individual circuit description. Use the actual load description (like "CEE-Steckdosenkombi Säule Halle Hinten" or "CEE-Steckdosenkombi Halle Hinten").
7. Pay close attention to Tripping Characteristics (e.g. B, C, gG). Read the characteristic (B or C or gG) carefully from the text corresponding to that column.

For the incoming main line (Einspeisung), search for:
- Main incoming protection device/switch: e.g. designations like '0Q1', '0F01', '1F0'. It might just be a switch (like 'HAB 63A'). Extract the rating (e.g. 63). If the characteristic is a switch type like 'HAB', set characteristic to "gL/gG" as a fallback so it is treated properly.
- Incoming main cable details: Look for designations like W1, kabel typ like 'H07RN-F', 'NYY-J', 'NYM-J', conductor cross-sections like '1x5x16', '3x1x150', '5x16', etc.

Return ONLY a JSON object in this format:
{
  "boardName": "Name of the distribution board",
  "einspeisung": {
    "name": "designation of incoming fuse/device, e.g. 0F01",
    "rating": 160, // number, e.g. 160, 63, 80 (or null if not found)
    "characteristic": "gG", // string, e.g. "gG", "gL/gG" (or null if not found)
    "kabelDesignation": "W1", // e.g. W1 (or null if not found)
    "kabeltyp": "H07RN-F", // e.g. H07RN-F, NYY-J, N2XH (or null if not found)
    "leiterAnzahl": "5", // number of conductors as string, e.g. "5" or "4"
    "leiterQuerschnitt": "3x1x150+1x150+1x70" // cross-section string, e.g. "3x1x150+1x150+1x70" or "16"
  },
  "fuses": [
    {
      "name": "fuse designation (e.g. 1F1.2)",
      "rating": 16, // number, e.g. 16, 10, 32
      "characteristic": "B", // string, e.g. "B", "C"
      "description": "German description of the circuit (e.g., Steckdosen Küche)",
      "rcd": true, // boolean, whether protected by RCD/FI
      "phases": 3 // number, 1 or 3. Set to 3 if it is a three-phase circuit/fuse (e.g. Herd, CEE, wallbox, heat pump, or multi-pole fuse), otherwise 1
    }
  ]
}

Ensure all keys match exactly. Do not include markdown code block formatting in your response. Return ONLY raw JSON text.

Extracted Text:
${fullText}`;

    const { text } = await generateText({
      model: openai('gpt-4o'),
      prompt: prompt,
    });

    let resultJson;
    try {
      // Clean up markdown code block wrappers if OpenAI still returned them
      const cleanedText = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      resultJson = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.error("OpenAI response parsing failed:", text);
      throw new Error("Failed to parse AI response into structured JSON");
    }

    return res.status(200).json({ ok: true, data: resultJson });
  } catch (err: any) {
    console.error('[Parse Plan API] Error:', err);
    return res.status(500).json({ ok: false, error: { message: err.message } });
  }
}
