const fs = require('fs');
const path = require('path');

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
    console.log("Loaded .env.local variables");
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
  const textPath = path.join(__dirname, 'last_extracted_text.txt');
  if (!fs.existsSync(textPath)) {
    console.error("last_extracted_text.txt not found");
    return;
  }
  const fullText = fs.readFileSync(textPath, 'utf8');

  const prompt = `You are a professional German electrical engineering AI assistant.
Analyze the following text extracted from an electrical distribution board schematic diagram.
Identify the distribution board name (like 'HV Unit ..... (LI03)', etc.), the incoming main line (Einspeisung / Hauptzuleitung) details, and extract a list of all circuits and fuses (sicherungen / wyłączniki).

CRITICAL PAGE-BY-PAGE PROCESSING INSTRUCTIONS:
1. Process the text PAGE-BY-PAGE. Go page-by-page from Page 1 to the end (e.g. Page 8). Fuses and descriptions are grouped on the same page. Do NOT mix descriptions or characteristics from Page 3 into fuses on Page 5 or Page 6!
2. DO NOT SKIP ANY FUSES/CIRCUITS. Every fuse designation (like 1F1, 1F1.1, 1F1.2, 1F2.1, 2F1, 2F1.1, 3F1, 3F1.1, 4F1, 4F1.1, etc.) found in the text MUST be present in the output array.
3. Be extremely careful with sequential lists of fuses (e.g., 2F1.1, 2F1.2, 2F1.3, 2F1.4, 2F1.5, 2F1.6). You MUST extract ALL of them in the sequence. Do not truncate the list early.
4. Align columns carefully:
   - For example on Page 3, we have fuses: 1F1.1, 1F1.2, 1F1.3, 1F1.4.
     - 1F1.1: Beleuchtung Halle, C 16A
     - 1F1.2: Beleuchtung Halle, C 16A
     - 1F1.3: Beleuchtung EG Mezzanine, C 16A
     - 1F1.4: Fluchtwegleuchten Halle, B 16A
   - On Page 5, we have fuses:
     - 1F2.1: Durchlauferhitzer 6,5kW Halle, B 16A (3-phase)
     - 1F2.2: Lufterhitzer Halle, B 16A (3-phase)
     - 1F2.3: Lichtkuppeln Halle, B 16A (1-phase)
     - 1F2.4: Fernwärme Halle, B 16A (1-phase)
     - 1F2.5: Reserve, B 16A (1-phase)
     - 1F2.6: Reserve, B 16A (1-phase)
     - 1F2.7: Reserve, B 16A (1-phase)
     - 1F2.8: BMA Netzteil Halle, B 16A (1-phase)
   - On Page 6, we have fuses:
     - 2F1.1: Technikraum, B 16A
     - 2F1.2: Beleuchtung / Steckdosen Mezzanine, B 16A
     - 2F1.3: MSR, B 16A
     - 2F1.4: Reserve, B 16A
     - 2F1.5: Reserve, B 16A
     - 2F1.6: Reserve, B 16A
     - 2F2.1: Datenverteilerschrank, B 16A
   - On Page 7, we have fuses:
     - 3F1.1: CEE-Steckdose Tore / Überlagebrücken Halle, C 16A (3-phase)
     - 3F1.2: CEE-Steckdosenkombi Mezzanine Halle, C 16A (3-phase)
     - 3F1.3: CEE-Steckdosenkombi Brandwand / Tore Halle, C 16A (3-phase)
   - On Page 8, we have fuses:
     - 4F1.1: CEE-Steckdosenkombi Säule Halle, C 16A (3-phase)
     - 4F1.2: CEE-Steckdosenkombi Säule Halle Hinten, C 16A (3-phase)
     - 4F1.3: CEE-Steckdosenkombi Halle Hinten, C 16A (3-phase)
5. Note that RCBOs (like 2F2.1, which is ADS B16A 30mA) might be located in a separate section of the page text (e.g. near the RCD 2Q1 on line 317) instead of being in the main sequence of 2F1.1-2F1.6. Always check the whole page for such isolated fuse names and include them.
6. Determine if the circuit is 3-phase (Drehstrom, e.g. stove/Herd, CEE sockets, wallbox, heat pump, instantaneous water heater / Durchlauferhitzer, lufterhitzer, or represented with 3 phases L1, L2, L3 in the drawing like 1F2.1, 1F2.2, 3F1.1, 4F1.1). Set "phases": 3 for these, and "phases": 1 for normal single-phase circuits.
7. Reconstruct descriptions from their columns:
   - For 1F1.5 (Page 4), the column description is "Steuersicherung Beleuchtung".
   - NEVER output internal product codes or models (such as "MBN", "MCN", "CDA", "ADS", "MCN") as descriptions. Reconstruct the actual functional description (e.g., "Steuersicherung Beleuchtung" or "Steuersicherung").
   - NEVER output group RCD descriptions (like "Fehlerstromschutzschalter 63A - 30mA") as the individual circuit description. Use the actual load description (like "CEE-Steckdosenkombi Säule Halle Hinten" or "CEE-Steckdosenkombi Halle Hinten").
8. Pay close attention to Tripping Characteristics (e.g. B, C, gG). For example:
   - Fuses 1F1.1, 1F1.2, 1F1.3 are MCN C 16A, so they MUST have characteristic "C".
   - Fuses 3F1.1-3F1.3 and 4F1.1-4F1.3 are MCN C 16A, so they MUST have characteristic "C".
   - Do not default everything to B. Read the characteristic (B or C or gG) carefully from the text corresponding to that column.

For the incoming main line (Einspeisung), search for:
- Main incoming protection device/fuse: e.g. designations like '0F01', '1F0', etc., rated at high currents like '160 A NH1', '125A', '63A', characteristic/type like 'gG', 'gL/gG', 'NH1'.
- Incoming main cable details: Look for designations like W1, kabel typ like 'H07RN-F', 'NYY-J', 'N2XH', conductor cross-sections like '3x1x150+1x150+1x70', '5x16', '4x50', etc.

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

  console.log("Calling OpenAI...");
  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: prompt,
    });

    const cleanedText = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    console.log("Raw Response:\n", cleanedText);
    const parsed = JSON.parse(cleanedText);
    fs.writeFileSync(path.join(__dirname, 'test_parse_result.json'), JSON.stringify(parsed, null, 2), 'utf8');
    console.log("Successfully parsed and saved to test_parse_result.json");
  } catch (err) {
    console.error("OpenAI call failed:", err);
  }
}

run();
