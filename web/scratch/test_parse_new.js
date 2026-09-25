const fs = require('fs');
const path = require('path');

// DOMMatrix Polyfill for Node.js
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(arg) {
      if (typeof arg === 'string') return;
      if (Array.isArray(arg)) {
        this.a = arg[0]; this.b = arg[1]; this.c = arg[2];
        this.d = arg[3]; this.e = arg[4]; this.f = arg[5];
      }
    }
  };
}

// Manually load .env.local
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        process.env[match[1]] = val;
      }
    });
  }
} catch (err) {
  console.error("Failed to load .env.local:", err);
}

const { generateText } = require('ai');
const { createOpenAI } = require('@ai-sdk/openai');

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const pdfPath = '/home/sebretu/building-task-manager/251119_Stromlaufplan_UV_Allgemein_Technik_4.pdf';
  const buffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDoc = await loadingTask.promise;

  let fullText = "";
  const maxPages = Math.min(pdfDoc.numPages, 15);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;

    // Group items into lines using vertical Y tolerance of 3.0
    const lines = [];
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
      line.items.sort((a, b) => a.transform[4] - b.transform[4]);

      const phrases = [];
      let currentPhrase = null;

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

  fs.writeFileSync(path.join(__dirname, 'extracted_text_debug.txt'), fullText, 'utf8');

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

IMPORTANT: Translate all descriptions and circuit names to GERMAN. For example, if you find "Gniazda kuchnia" or "Kuchnia gniazda", translate to "Steckdosen Küche". If you find "Zmywarka", translate to "Geschirrspüler".

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

  console.log("Calling OpenAI (gpt-4o)...");
  try {
    const { text } = await generateText({
      model: openai('gpt-4o'),
      prompt: prompt,
    });

    const cleanedText = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    console.log("Raw Response:\n", cleanedText);
    const parsed = JSON.parse(cleanedText);
    fs.writeFileSync(path.join(__dirname, 'new_parse_result.json'), JSON.stringify(parsed, null, 2), 'utf8');
    console.log("Successfully parsed and saved to new_parse_result.json");
  } catch (err) {
    console.error("OpenAI call failed:", err);
  }
}

run();
