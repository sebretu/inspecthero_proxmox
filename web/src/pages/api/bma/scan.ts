import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import path from "path";
import { promises as fs } from "fs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-ignore
import { createWorker } from "tesseract.js";

// Polyfill DOMMatrix for pdfjs-dist in Node environment
if (typeof (global as any).DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {
    constructor() { }
  };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: { message: "Method not allowed" } });

  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  const { fileData, fileName, projectId, planId, regex, useExisting } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  
  let buffer: Buffer;
  let effectiveFileName = fileName || "plan.pdf";

  try {
    console.log('[BMA Scan] Starting scan...', { useExisting, planId, fileName });
    if (useExisting && planId) {
        const admin = getSupabaseAdminClient();
        const { data: plan, error: planErr } = await admin.from('plans').select('storage_bucket, storage_path').eq('id', planId).single();
        if (planErr || !plan) {
            console.error('[BMA Scan] Plan fetch error:', planErr);
            return res.status(404).json({ ok: false, error: { message: "Plan not found in storage" } });
        }
        
        console.log('[BMA Scan] Downloading from storage:', plan.storage_bucket, plan.storage_path);
        const { data: fileBlob, error: downloadErr } = await admin.storage.from(plan.storage_bucket).download(plan.storage_path);
        if (downloadErr || !fileBlob) {
            console.error('[BMA Scan] Download error:', downloadErr);
            return res.status(500).json({ ok: false, error: { message: `Download error: ${downloadErr?.message || 'Unknown'}` } });
        }
        
        buffer = Buffer.from(await fileBlob.arrayBuffer());
        effectiveFileName = plan.storage_path || "plan.pdf";
        console.log('[BMA Scan] Downloaded buffer size:', buffer.length);
    } else {
        if (!fileData) return res.status(400).json({ ok: false, error: { message: "Missing fileData" } });
        buffer = Buffer.from(fileData, 'base64');
        console.log('[BMA Scan] Uploaded buffer size:', buffer.length);
    }

    // 0. Load plan metadata for precise coordinate correction (calibration)
    let metaCorrection = { scaleX: 1.0, scaleY: 1.0 };
    if (planId) {
      try {
        const metaPath = path.join(process.cwd(), "private_tiles", planId, "meta.json");
        const raw = await fs.readFile(metaPath, "utf8");
        const meta = JSON.parse(raw);
        if (meta.imageWidth && meta.gridW && meta.tileSize && meta.imageHeight && meta.gridH) {
          metaCorrection.scaleX = meta.imageWidth / (meta.gridW * meta.tileSize);
          metaCorrection.scaleY = meta.imageHeight / (meta.gridH * meta.tileSize);
          console.log('[BMA Scan] Applied precision scaling from metadata:', metaCorrection);
        }
      } catch (e) {
        console.warn('[BMA Scan] Metadata for calibration not found, falling back to 1:1');
      }
    }

    const deviceRegex = new RegExp(regex || '((?:[A-Z]{1,3})?\\s*\\d{1,4}(?:\\s*[./]\\s*\\d{1,4}){1,3}|[A-Z]{1,3}\\s*\\d{1,4}|PA10\\s*S\\d|BMA|BMZ|FIZ|HM|ÜG|FSD|SDA|NSL)', 'g');
    
    let detectedDevices: any[] = [];

    if (effectiveFileName.toLowerCase().endsWith('.pdf')) {
      // PDF Processing
      const data = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({ data });
      const pdf = await loadingTask.promise;
      console.log('[BMA Scan] PDF loaded. Pages:', pdf.numPages);
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        
        // Advanced text reconstruction: Map every character back to its source item
        let pageText = "";
        let charToItem: any[] = [];
        
        const textItems = (textContent.items.filter((item: any) => 'str' in item) as any[])
            .sort((a, b) => {
                const ay = a.transform[5];
                const by = b.transform[5];
                if (Math.abs(ay - by) > 2) return by - ay;
                return a.transform[4] - b.transform[4];
            });

        for (const item of textItems) {
            const str = item.str || "";
            for (let c = 0; c < str.length; c++) {
                charToItem.push(item);
            }
            pageText += str + " ";
            charToItem.push(null); // The join space
        }

        // Ultimate Space-Agnostic Matching:
        // 1. Create a dense version of the text (no spaces)
        // 2. Maintain a map back to the original character index
        let denseText = "";
        let denseToCharIndex: number[] = [];
        for (let i = 0; i < pageText.length; i++) {
            const char = pageText[i];
            if (/\S/.test(char)) { // If it's not a whitespace character
                denseText += char;
                denseToCharIndex.push(i);
            }
        }

        // Updated Regex: allows 2-digit (03/06) and 3-digit (300-700) prefixes. No 4-digit prefixes.
        const industrialRegex = /((?:[3-7]\d{2}|\d{2})[./-]\d{1,2}|s\d{1,2}(?!\d)|(?:BMZ|FIZ)(?!\d))/gi;
        
        const matches = [...denseText.matchAll(industrialRegex)];
        console.log(`[BMA Scan] Page ${i} matches found in dense text:`, matches.length);

        for (const match of matches) {
          const deviceName = match[0];
          if (deviceName.length > 7) continue; // Allow thr001 (6) or similar
          
          const denseIndex = match.index || 0;
          
          // Map back to original items
          const involvedItems: any[] = [];
          for (let k = 0; k < deviceName.length; k++) {
              const charIndex = denseToCharIndex[denseIndex + k];
              const item = charToItem[charIndex];
              if (item && !involvedItems.includes(item)) involvedItems.push(item);
          }
          
          if (involvedItems.length === 0) continue;

          // Positioning: Use the first item as anchor and shift LEFT to align with typical symbol positions
          const firstItem = involvedItems[0];
          const tx = firstItem.transform[4];
          const ty = firstItem.transform[5];
          
          // Shift right by 10 units to move icons further away from the text start
          const [vx, vy] = viewport.convertToViewportPoint(tx + 10, ty - 2);
          
          // Apply metadata-based calibration to match the actual tile grid (max zoom boundary)
          let x = (vx / viewport.width) * metaCorrection.scaleX;
          let y = (vy / viewport.height) * metaCorrection.scaleY;

          detectedDevices.push({
            name: deviceName.toUpperCase(), // Normalize to uppercase
            type: "Detected",
            x,
            y,
            page: i
          });
        }
      }
    } else {
      // Image Processing using Tesseract
      const worker = await createWorker('pol+eng+deu+slk');
      const { data: { text } } = await worker.recognize(buffer);
      const lines = text.split('\n');
      lines.forEach((line: string, idx: number) => {
          const matches = line.matchAll(deviceRegex);
          for (const match of matches) {
              detectedDevices.push({
                  name: match[0],
                  type: "Detected via OCR",
                  x: 0.5, // Center as fallback for images
                  y: 0.5,
                  page: 1
              });
          }
      });
      await worker.terminate();
    }

    // If no devices found in text layer and it's a scan or image, try OCR (Simplified logic)
    if (detectedDevices.length === 0) {
        // Fallback to OCR logic here... 
        // For brevity in this initial implementation, we focus on text layer
        // Full OCR implementation would require rendering PDF pages to canvas/images
    }

    return res.status(200).json({ ok: true, data: detectedDevices });
  } catch (err: any) {
    console.error('[BMA Scan] Fatal error:', err);
    return res.status(500).json({ ok: false, error: { message: err.message } });
  }
}
