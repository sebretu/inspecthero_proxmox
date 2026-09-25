import "@/lib/pdfPolyfill";
import { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
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

  if (req.method === "POST") {
    try {
      const { fileData, fileName, projectId, regex } = req.body;
      if (!fileData || !projectId) {
        return res.status(400).json({ ok: false, error: { message: "Missing data" } });
      }

      const buffer = Buffer.from(fileData, 'base64');
      const deviceRegex = new RegExp(regex || '(\\d{1,4}\\s*[./]\\s*\\d{1,4}|[A-Z]{1,3}\\s*\\d{1,4}|PA10\\s*S\\d|BMA|BMZ|FIZ|HM|ÜG|FSD|SDA|NSL)', 'g');

      // PDF Processing
      const data = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({ data });
      const pdf = await loadingTask.promise;
      
      const foundNames: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const textItems = (textContent.items as any[]).filter((item: any) => 'str' in item);
        
        // We want to keep the order as much as possible
        // PDFJS text items are usually in logical order of the stream
        for (const item of textItems) {
            const matches = item.str.match(deviceRegex);
            if (matches) {
                for (const m of matches) {
                    // Avoid immediate duplicates if they appear in same item or adjacent items
                    if (foundNames[foundNames.length - 1] !== m) {
                        foundNames.push(m);
                    }
                }
            }
        }
      }

      return res.status(200).json({ ok: true, data: foundNames });
    } catch (err: any) {
      console.error('[BMA Schematic Scan] Error:', err);
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  return res.status(405).end();
}
