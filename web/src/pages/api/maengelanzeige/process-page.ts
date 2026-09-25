import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { AIRelevance } from "@/types/maengelanzeige";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import sharp from "sharp";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
    responseLimit: false,
  },
  maxDuration: 60,
};

/**
 * Robust deterministic local table parser for German construction defect lists & reports.
 * Parses all numbered rows, sub-bullets, pipe-separated tables, and space-aligned columns.
 */
/**
 * Robust deterministic local table parser for German construction defect lists & reports (e.g. LIST BAU, docu tools, Capmo, PlanRadar).
 * Parses numbered defect rows, skipping date headers, photo timestamps, and document metadata.
 */
function parseTableTextLocally(pageNumber: number, text: string): any[] {
  const itemsMap = new Map<string, any>();
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  
  // Patterns for defect item starts: integer number (e.g. "739", "753", "810", "1", "2"), "Pos. 1", "Nr. 1", "Mangel 1"
  // Explicitly excludes dates like "15.12.2025" or "02.03.2026"
  const itemHeaderRegex = /^(\bPos\.?\s*\d+|\bNr\.?\s*\d+|\bMangel\s*\d+|\d{1,6})\s+([^\s].*)$/i;
  
  let currentItem: any = null;

  for (const line of lines) {
    // Skip purely table headers, footer metadata, cover letter lines, zip codes, and photo dates
    if (
      /^(Nr\.?|Pos\.?|Lfd|Laufende|Mangel|Bezeichnung|Ort|Raum|Bauteil|Gewerk|Firma|Status|Kategorie|Datum|Prüfer|Dok\.-Id|Seite\s+\d+|Bestätigung|Hiermit wird|Frist zur|Projekt:|Bauvorhaben:|Nachfristsetzung|Sehr geehrte|Mit freundlichen|Anlagen:|Nur per|Telefon|Tel\.|Fax|E-Mail|IBAN|BIC|Handelsregister|Steuer-Nr|Heinrich-Herz|Viktoria|EtecProjekt)/i.test(line) ||
      /^\d{5}\s+[A-ZÄÖÜ]/.test(line) || // German ZIP code (e.g. 40699 Erkrath, 33649 Bielefeld)
      /^Datum des Fotos:\s*\d{2}\.\d{2}\.\d{4}/i.test(line) ||
      /^\d{2}\.\d{2}\.\d{4}$/.test(line) ||
      /^-{4,}/.test(line) ||
      /^={4,}/.test(line) ||
      /^(\.{4,}|_{4,})/.test(line) // signature lines
    ) {
      continue;
    }

    const match = line.match(itemHeaderRegex);
    const rawNum = match ? match[1].replace(/^(Pos\.?|Nr\.?|Mangel)\s*/i, "").trim() : "";
    const isDate = /^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/.test(rawNum);
    const isZipCode = /^\d{5}$/.test(rawNum);

    if (match && !isDate && !isZipCode && rawNum.length > 0) {
      if (currentItem && currentItem.original_text) {
        if (itemsMap.has(currentItem.item_number)) {
          const existing = itemsMap.get(currentItem.item_number);
          existing.original_text += ` ${currentItem.original_text}`;
        } else {
          itemsMap.set(currentItem.item_number, currentItem);
        }
      }
      
      const rest = match[2].trim();
      let location = "";
      let trade = "";
      let desc = rest;

      if (rest.includes("|")) {
        const parts = rest.split("|").map((p) => p.trim());
        if (parts.length >= 3) {
          location = parts[0];
          desc = parts[1];
          trade = parts[2];
        } else if (parts.length === 2) {
          location = parts[0];
          desc = parts[1];
        }
      } else {
        // Look for location prefix or suffix (e.g. LI03 - Halle 3 / MU04 - Halle 4)
        const locMatch = desc.match(/\b(LI\d+\s*-\s*[^\s].*|MU\d+\s*-\s*[^\s].*|Halle\s+\d+.*|EG\s+.*|OG\s+.*|UG\s+.*|Keller.*|Raum\s+.*)/i);
        if (locMatch) {
          location = locMatch[1];
          desc = desc.replace(locMatch[0], "").trim();
        }
      }

      currentItem = {
        item_number: rawNum,
        trade_or_company: trade || null,
        location: location || null,
        page_number: pageNumber,
        original_text: desc || "Mangel festgestellt",
        ai_relevance: "RELEVANT",
        ai_relevance_reason: "Aus Tabelle extrahiert.",
      };
    } else if (currentItem) {
      // Append multi-line location or description text (e.g. "MZ - Mezzanine / U4.1.01 - Büro 04")
      if (/^(LI\d+|MU\d+|Halle|Unit|MZ|Büro|Raum|Flur|EG|OG|UG)/i.test(line)) {
        currentItem.location = currentItem.location ? `${currentItem.location} / ${line}` : line;
      } else {
        currentItem.original_text += ` ${line}`;
      }
    }
  }

  if (currentItem && currentItem.original_text) {
    if (itemsMap.has(currentItem.item_number)) {
      const existing = itemsMap.get(currentItem.item_number);
      existing.original_text += ` ${currentItem.original_text}`;
    } else {
      itemsMap.set(currentItem.item_number, currentItem);
    }
  }

  return Array.from(itemsMap.values());
}

async function extractItemsWithLocalAi(pageNumber: number, pageText: string): Promise<any[]> {
  const systemPrompt = `You are an expert German construction defect extraction system.
Extract the distinct defect items from this table page into structured JSON.

CRITICAL RULES FOR EXTRACTION:
1. "nr": The exact original defect number from the "Nr." column (e.g. "739", "753", "810", "835", "930", "1", "2").
   - NEVER repeat or duplicate item numbers!
   - NEVER create items for photo dates (e.g. "Datum des Fotos: 15.12.2025"), document IDs (e.g. "39762"), zip codes (e.g. "40699"), or page numbers!
2. "gewerk": The trade/company (e.g. "Elektro", "KdSK", "EtecProjekt").
3. "ort": The location/room (e.g. "LI03 - Halle 3 / U4 - Unit 4", "MU04 - Halle 4").
4. "text": The defect description only (e.g. "Sonnenschutz anschließen", "Kappe fehlt.").
5. "rel": "RELEVANT" | "POSSIBLY_RELEVANT" | "NOT_RELEVANT".

Format strictly as JSON:
{
  "items": [
    {
      "nr": "739",
      "gewerk": "Elektro",
      "ort": "LI03 - Halle 3 / U4 - Unit 4",
      "text": "Sonnenschutz anschließen.",
      "rel": "RELEVANT"
    }
  ]
}`;

  const localAiUrl = process.env.LOCAL_AI_URL || "http://192.168.178.4:8000";
  const localAiKey = process.env.LOCAL_AI_KEY || "e06be799d068c8c841338aaf7808bb84e6b4444e9aa813174a5681c00f931631";

  if (localAiUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 40000);

      const localRes = await fetch(`${localAiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": localAiKey,
        },
        body: JSON.stringify({
          message: `PAGE ${pageNumber} CONTENT:\n\n${pageText}`,
          system_prompt: systemPrompt,
          temperature: 0.0,
          max_tokens: 1536,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (localRes.ok) {
        const localData = await localRes.json();
        let raw = localData?.response || "{}";
        raw = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
        let parsed: any = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          const first = raw.indexOf("{");
          const last = raw.lastIndexOf("}");
          if (first !== -1 && last !== -1) {
            parsed = JSON.parse(raw.substring(first, last + 1));
          }
        }
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const uniqueItemsMap = new Map<string, any>();
          for (const it of parsed.items) {
            const rawNr = String(it.nr || it.item_number || "").trim();
            if (!rawNr || /^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/.test(rawNr) || /^\d{5}$/.test(rawNr) || rawNr.length > 10) {
              continue;
            }
            if (!uniqueItemsMap.has(rawNr)) {
              uniqueItemsMap.set(rawNr, {
                item_number: rawNr,
                trade_or_company: it.gewerk || it.trade_or_company || null,
                location: it.ort || it.location || null,
                original_text: it.text || it.original_text || it.mangel || "Mangel festgestellt",
                ai_relevance: it.rel || it.ai_relevance || "RELEVANT",
                ai_relevance_reason: "Lokal per KI analysiert.",
              });
            }
          }
          if (uniqueItemsMap.size > 0) {
            return Array.from(uniqueItemsMap.values());
          }
        }
      }
    } catch (localErr: any) {
      console.warn(`[Mängelanzeige Page ${pageNumber}] Local AI error (${localErr.message}). Using local table parser.`);
    }
  }

  return parseTableTextLocally(pageNumber, pageText);
}

/**
 * Determines if an image buffer is a real colorful camera photo (e.g. construction site photo)
 * vs a monochrome/grayscale CAD plan drawing or vector logo (LIST BAU orange cross, blue icons, red stamps).
 */
async function isRealColorfulPhoto(buffer: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;

    // Reject small logos, icons, stamps, and page headers:
    // Real camera photos on construction defect lists are high-resolution (min dimension >= 300px, area >= 150,000 px)
    // Logos/icons are small (e.g. 275x121, 354x198)
    if (w < 350 || h < 300 || w * h < 150000) {
      return false;
    }

    const rawData = await sharp(buffer)
      .resize(64, 64, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

    let totalColorDiff = 0;
    let colorfulPixels = 0;
    const uniqueColors = new Set<number>();
    const pixelCount = 64 * 64;

    for (let i = 0; i < rawData.length; i += 3) {
      const r = rawData[i];
      const g = rawData[i + 1];
      const b = rawData[i + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const diff = max - min;
      totalColorDiff += diff;

      if (diff > 14) {
        colorfulPixels++;
      }

      // Quantize to 5-bit color (32 levels per channel = 32,768 possible colors)
      const q = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      uniqueColors.add(q);
    }

    const avgColorDiff = totalColorDiff / pixelCount;
    const colorfulRatio = colorfulPixels / pixelCount;
    const uniqueCount = uniqueColors.size;

    // Real on-site photos (concrete, cables, facade, roof, digger, walls) have:
    // - High color variation (avgColorDiff >= 6.0)
    // - High ratio of color pixels (colorfulRatio >= 0.05)
    // - Complex photographic color gradient (uniqueCount >= 100 in 64x64 thumbnail)
    // - Grayscale/CAD plans have avgColorDiff < 2.0 and uniqueCount < 100
    // - Flat vector logos have uniqueCount < 50
    return avgColorDiff >= 6.0 && colorfulRatio >= 0.05 && uniqueCount >= 100;
  } catch {
    return false;
  }
}

/**
 * Extracts embedded photos from this PDF page and attaches them uniquely (no duplicates) to corresponding defect items as Vorher-Foto
 */
async function extractAndAttachPagePhotos(
  admin: any,
  documentId: string,
  storagePath: string | undefined,
  pageNumber: number,
  insertedItems: any[],
  pageText: string,
  userId: string
): Promise<void> {
  const tempDir = path.join("/tmp", `mangel_img_${documentId}_p${pageNumber}_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const localPdfPath = path.join("/tmp", `mangel_doc_${documentId}.pdf`);

  try {
    // 1. Ensure PDF exists locally
    if (!fs.existsSync(localPdfPath)) {
      if (!storagePath) {
        const { data: doc } = await admin
          .from("maengelanzeige_documents")
          .select("storage_path")
          .eq("id", documentId)
          .maybeSingle();
        if (doc?.storage_path) {
          storagePath = doc.storage_path;
        }
      }

      if (storagePath) {
        const { data: fileBlob, error: downloadError } = await admin.storage
          .from("maengelanzeige")
          .download(storagePath);
        if (!downloadError && fileBlob) {
          const arrayBuffer = await fileBlob.arrayBuffer();
          fs.writeFileSync(localPdfPath, Buffer.from(arrayBuffer));
        }
      }
    }

    if (!fs.existsSync(localPdfPath)) return;

    // 2. Extract raster images from this page using pdfimages
    const imgPrefix = path.join(tempDir, "img");
    try {
      execSync(`pdfimages -png -f ${pageNumber} -l ${pageNumber} "${localPdfPath}" "${imgPrefix}"`, {
        timeout: 20000,
      });
    } catch (e: any) {
      console.warn(`[Mängelanzeige Photo Extract] pdfimages page ${pageNumber} notice:`, e.message);
    }

    // 3. Collect and filter ONLY REAL COLORFUL PHOTOS (skipping black & white / grayscale CAD floorplans and logos)
    const extractedFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith("img-") && f.endsWith(".png")).sort();
    const validPhotos: Array<{ filename: string; buffer: Buffer; width: number; height: number }> = [];

    for (const file of extractedFiles) {
      const filePath = path.join(tempDir, file);
      const stat = fs.statSync(filePath);
      if (stat.size < 5000) continue; // skip tiny icons / lines / logos

      try {
        const rawBuf = fs.readFileSync(filePath);
        const meta = await sharp(rawBuf).metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;

        // Valid photo: resolution >= 220x180 and area >= 30000 px
        if (w >= 220 && h >= 180 && w * h >= 30000) {
          const ratio = Math.max(w / h, h / w);
          if (ratio < 4.0) {
            // Check if image is a real colorful photo (reject logos & CAD plans)
            const isPhoto = await isRealColorfulPhoto(rawBuf);
            if (isPhoto) {
              const jpgBuf = await sharp(rawBuf)
                .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();

              validPhotos.push({
                filename: file,
                buffer: jpgBuf,
                width: w,
                height: h,
              });
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Mängelanzeige Photo] Failed to inspect ${file}:`, err.message);
      }
    }

    if (validPhotos.length === 0) return;

    console.log(`[Mängelanzeige Page ${pageNumber}] ✓ Found ${validPhotos.length} real colorful site photos.`);

    const supabaseBaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://api.et4u.de").replace(/\/$/, "");

    let photoCursor = 0;

    // Check if there is an orphaned photo at the top of this page belonging to the previous page's last item
    const firstItem = insertedItems[0];
    const firstItemIdx = firstItem ? pageText.indexOf(firstItem.item_number) : -1;
    const preText = firstItemIdx !== -1 ? pageText.substring(0, firstItemIdx) : pageText;
    const preDateMatches = preText.match(/Datum des Fotos/gi);

    if (preDateMatches && preDateMatches.length > 0 && photoCursor < validPhotos.length) {
      // Find previous page's last item
      const { data: prevItems } = await admin
        .from("maengelanzeige_items")
        .select("*")
        .eq("document_id", documentId)
        .lt("page_number", pageNumber)
        .order("sort_order", { ascending: false })
        .limit(1);

      if (prevItems && prevItems.length > 0) {
        const prevItem = prevItems[0];
        const numPhotosToAssign = Math.min(1, validPhotos.length - photoCursor);
        const assignedPhotos = validPhotos.slice(photoCursor, photoCursor + numPhotosToAssign);
        photoCursor += assignedPhotos.length;

        for (let pIdx = 0; pIdx < assignedPhotos.length; pIdx++) {
          const photo = assignedPhotos[pIdx];
          const photoFileName = `${prevItem.id}/${Date.now()}_carryover_${pIdx}_vorher.jpg`;
          const { error: uploadErr } = await admin.storage
            .from("maengelanzeige-photos")
            .upload(photoFileName, photo.buffer, { contentType: "image/jpeg", upsert: true });

          if (!uploadErr) {
            const photoUrl = `${supabaseBaseUrl}/storage/v1/object/public/maengelanzeige-photos/${photoFileName}`;
            await admin.from("maengelanzeige_photos").insert({
              item_id: prevItem.id,
              storage_bucket: "maengelanzeige-photos",
              storage_path: photoFileName,
              url: photoUrl,
              caption: `[VORHER] Foto aus PDF (Seite ${pageNumber})`,
              photo_type: "BEFORE",
              uploaded_by: userId,
            });
            await admin.from("maengelanzeige_items").update({ export_include_before_photos: true, is_selected: true }).eq("id", prevItem.id);
          }
        }
      }
    }

    // Assign exactly 1 real site photo per defect item on this page
    for (let i = 0; i < insertedItems.length; i++) {
      if (photoCursor >= validPhotos.length) break;

      const targetItem = insertedItems[i];
      const photo = validPhotos[photoCursor++];

      const photoFileName = `${targetItem.id}/${Date.now()}_vorher.jpg`;

      const { error: uploadErr } = await admin.storage
        .from("maengelanzeige-photos")
        .upload(photoFileName, photo.buffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadErr) {
        console.warn(`[Mängelanzeige Photo] Upload error for item ${targetItem.item_number}:`, uploadErr.message);
        continue;
      }

      const photoUrl = `${supabaseBaseUrl}/storage/v1/object/public/maengelanzeige-photos/${photoFileName}`;
      const caption = `[VORHER] Foto aus PDF (Seite ${pageNumber})`;

      let insertPayload: Record<string, any> = {
        item_id: targetItem.id,
        storage_bucket: "maengelanzeige-photos",
        storage_path: photoFileName,
        url: photoUrl,
        caption,
        photo_type: "BEFORE",
        uploaded_by: userId,
      };

      let { data: insertedPhoto, error: photoDbErr } = await admin
        .from("maengelanzeige_photos")
        .insert(insertPayload)
        .select()
        .single();

      if (photoDbErr && photoDbErr.message?.includes("column")) {
        delete insertPayload.photo_type;
        const retry = await admin
          .from("maengelanzeige_photos")
          .insert(insertPayload)
          .select()
          .single();
        insertedPhoto = retry.data;
      }

      if (insertedPhoto) {
        if (!targetItem.photos) targetItem.photos = [];
        targetItem.photos.push({
          id: insertedPhoto.id,
          url: insertedPhoto.url,
          caption: insertedPhoto.caption,
          photoType: "BEFORE",
          uploaded_by: userId,
          created_at: insertedPhoto.created_at,
        });

        try {
          await admin
            .from("maengelanzeige_items")
            .update({
              export_include_before_photos: true,
              is_selected: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", targetItem.id);
          targetItem.export_include_before_photos = true;
          targetItem.is_selected = true;
        } catch {}
      }
    }
  } catch (err: any) {
    console.error(`[Mängelanzeige Photo Extract Error Page ${pageNumber}]:`, err);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

function normalizeItemNumber(raw: string): string {
  return String(raw || "")
    .replace(/^(Punkt|Pos\.?|Nr\.?|Mangel)\s*/i, "")
    .replace(/[\.\)]$/, "")
    .trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { message: "Method Not Allowed" } });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    const result = createServerSupabaseClient(req);
    supabase = result.client;
    userId = result.userId;
    if (!userId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  const { documentId, projectId, pageNumber, pageText, startIndex = 0, storagePath } = req.body || {};

  if (!documentId || !projectId || typeof pageNumber !== "number") {
    return res.status(400).json({ ok: false, error: { message: "Missing documentId, projectId, or pageNumber" } });
  }

  const admin = getSupabaseAdminClient();

  try {
    const cleanText = String(pageText || "").trim();
    if (!cleanText) {
      return res.status(200).json({ ok: true, pageNumber, items: [], count: 0 });
    }

    // Cover letter / non-table page check (e.g. Page 1 Anschreiben / Nachfristsetzung)
    const isCoverLetterPage =
      /(Sehr geehrte|Nachfristsetzung|Anlagen:\s*Mangelliste|mit Schreiben vom|Viktoria Nellißen|Hiermit fordern wir)/i.test(cleanText) &&
      !/(Nr\.?\s*\|\s*Bezeichnung|Nr\.\s+Bezeichnung|Mängelaufstellung|Pos\.?\s+Bezeichnung)/i.test(cleanText);

    if (isCoverLetterPage) {
      console.log(`[Mängelanzeige Page ${pageNumber}] Cover letter / non-table page detected. Skipping.`);
      return res.status(200).json({ ok: true, pageNumber, items: [], count: 0 });
    }

    // 1. Get deterministic items from table
    const deterministicItems = parseTableTextLocally(pageNumber, cleanText);
    const itemsMap = new Map<string, any>();

    for (const d of deterministicItems) {
      const normNr = normalizeItemNumber(d.item_number);
      if (normNr && !/^\d{5}$/.test(normNr)) {
        itemsMap.set(normNr, { ...d, item_number: normNr });
      }
    }

    // 2. Enrich with Local AI
    try {
      const aiItems = await extractItemsWithLocalAi(pageNumber, cleanText);
      for (const ai of aiItems) {
        const normNr = normalizeItemNumber(ai.item_number);
        if (normNr && !/^\d{5}$/.test(normNr)) {
          if (itemsMap.has(normNr)) {
            const existing = itemsMap.get(normNr);
            if (ai.trade_or_company) existing.trade_or_company = ai.trade_or_company;
            if (ai.location && (!existing.location || ai.location.length > existing.location.length)) {
              existing.location = ai.location;
            }
            if (ai.original_text && ai.original_text.length > existing.original_text.length) {
              existing.original_text = ai.original_text;
            }
            if (ai.ai_relevance) existing.ai_relevance = ai.ai_relevance;
            if (ai.ai_relevance_reason) existing.ai_relevance_reason = ai.ai_relevance_reason;
          } else if (/^\d{1,6}$/.test(normNr)) {
            itemsMap.set(normNr, { ...ai, item_number: normNr });
          }
        }
      }
    } catch (e: any) {
      console.warn(`[Mängelanzeige Page ${pageNumber}] AI enrichment notice:`, e.message);
    }

    // 3. Fetch existing items from DB to prevent duplicate insertion
    const { data: existingDbItems } = await admin
      .from("maengelanzeige_items")
      .select("id, item_number, original_text, location, trade_or_company, page_number")
      .eq("document_id", documentId);

    const existingMap = new Map((existingDbItems || []).map((it: any) => [normalizeItemNumber(it.item_number), it]));

    const rawItems = Array.from(itemsMap.values());
    const itemsToInsert: any[] = [];
    const existingItemsToUpdate: any[] = [];

    rawItems.forEach((item, idx) => {
      const normNr = normalizeItemNumber(item.item_number);
      if (existingMap.has(normNr)) {
        const existing = existingMap.get(normNr);
        existingItemsToUpdate.push(existing);
      } else {
        itemsToInsert.push({
          document_id: documentId,
          project_id: projectId,
          item_number: normNr || `Punkt ${startIndex + idx + 1}`,
          trade_or_company: item.trade_or_company ? String(item.trade_or_company).trim() : null,
          location: item.location ? String(item.location).trim() : null,
          page_number: pageNumber,
          original_text: String(item.original_text || "").trim(),
          ai_relevance: (["RELEVANT", "POSSIBLY_RELEVANT", "NOT_RELEVANT"].includes(item.ai_relevance)
            ? item.ai_relevance
            : "POSSIBLY_RELEVANT") as AIRelevance,
          ai_relevance_reason: item.ai_relevance_reason || null,
          is_selected: false,
          status: "OPEN",
          sort_order: startIndex + idx,
        });
      }
    });

    let insertedItems: any[] = [];
    if (itemsToInsert.length > 0) {
      const { data: inserted, error: itemsError } = await admin
        .from("maengelanzeige_items")
        .insert(itemsToInsert)
        .select();

      if (itemsError) {
        console.error(`[Mängelanzeige Page ${pageNumber}] Error inserting items:`, itemsError);
      } else {
        insertedItems = (inserted || []).map((it: any) => ({ ...it, photos: [] }));
      }
    }

    const allPageItems = [...insertedItems, ...existingItemsToUpdate];

    // Automatically extract real colorful defect photos for this page and attach as Vorher-Fotos
    await extractAndAttachPagePhotos(
      admin,
      documentId,
      storagePath,
      pageNumber,
      allPageItems,
      cleanText,
      userId
    );

    return res.status(200).json({
      ok: true,
      pageNumber,
      items: allPageItems,
      count: allPageItems.length,
    });
  } catch (error: any) {
    console.error(`[Mängelanzeige Page ${pageNumber} Error]:`, error);
    return res.status(500).json({
      ok: false,
      pageNumber,
      error: { message: error.message || "Failed to process page" },
    });
  }
}


