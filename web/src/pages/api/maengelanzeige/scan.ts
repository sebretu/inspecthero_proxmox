import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "60mb",
    },
    responseLimit: false,
  },
  maxDuration: 60,
};

async function extractTextFromPdf(buffer: Buffer): Promise<{ totalPages: number; pages: Array<{ page: number; text: string }> }> {
  const tempDir = path.join("/tmp", `scan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const tempPdfPath = path.join(tempDir, "input.pdf");
  const tempTxtPath = path.join(tempDir, "output.txt");

  try {
    fs.writeFileSync(tempPdfPath, buffer);

    // 1. Get total pages using pdfinfo
    let totalPages = 1;
    try {
      const infoOutput = execSync(`pdfinfo "${tempPdfPath}"`, { timeout: 10000 }).toString();
      const match = infoOutput.match(/Pages:\s+(\d+)/);
      if (match && match[1]) {
        totalPages = parseInt(match[1], 10);
      }
    } catch (e: any) {
      console.warn("[Mängelanzeige Scan] pdfinfo warning:", e.message);
    }

    // 2. Extract layout-preserved text using pdftotext
    let pages: Array<{ page: number; text: string }> = [];
    let totalChars = 0;

    try {
      execSync(`pdftotext -layout "${tempPdfPath}" "${tempTxtPath}"`, { timeout: 20000 });
      if (fs.existsSync(tempTxtPath)) {
        const fullOutput = fs.readFileSync(tempTxtPath, "utf8");
        const rawPages = fullOutput.split("\x0c"); // pdftotext separates pages with Form Feed \x0c

        rawPages.forEach((pText, idx) => {
          if (idx < totalPages || pText.trim()) {
            const pageNum = idx + 1;
            const cleaned = pText.trim();
            totalChars += cleaned.length;
            pages.push({ page: pageNum, text: cleaned });
          }
        });
      }
    } catch (e: any) {
      console.warn("[Mängelanzeige Scan] pdftotext warning:", e.message);
    }

    // 3. Fallback to OCR if digital text is very short (scanned PDF)
    if (totalChars < 60) {
      console.log(`[Mängelanzeige Scan] Low digital text (${totalChars} chars). Running OCR with Tesseract...`);
      const pagePrefix = path.join(tempDir, "page");
      try {
        execSync(`pdftoppm -png -r 150 -l 25 "${tempPdfPath}" "${pagePrefix}"`, { timeout: 60000 });
        const pngFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith("page-") && f.endsWith(".png")).sort();
        const ocrPages: Array<{ page: number; text: string }> = [];

        for (let idx = 0; idx < pngFiles.length; idx++) {
          const pngPath = path.join(tempDir, pngFiles[idx]);
          const outBase = path.join(tempDir, `ocr_out_${idx + 1}`);
          try {
            execSync(`tesseract "${pngPath}" "${outBase}" -l deu+eng --psm 6`, { timeout: 30000 });
            const ocrText = fs.readFileSync(`${outBase}.txt`, "utf8");
            ocrPages.push({ page: idx + 1, text: ocrText.trim() });
          } catch (ocrErr: any) {
            console.warn(`[Mängelanzeige OCR] Page ${idx + 1} warning:`, ocrErr.message);
          }
        }

        if (ocrPages.length > 0) {
          pages = ocrPages;
          if (ocrPages.length > totalPages) totalPages = ocrPages.length;
        }
      } catch (ocrEx: any) {
        console.warn("[Mängelanzeige OCR] OCR exception:", ocrEx.message);
      }
    }

    return { totalPages: Math.max(1, totalPages), pages };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
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

  const { fileData, fileName, projectId, title } = req.body || {};

  if (!fileData || !projectId) {
    return res.status(400).json({ ok: false, error: { message: "Missing fileData or projectId" } });
  }

  const admin = getSupabaseAdminClient();

  try {
    const effectiveFileName = fileName || "maengelanzeige.pdf";
    const effectiveTitle = (title || effectiveFileName.replace(/\.pdf$/i, "")).trim();
    const buffer = Buffer.from(fileData, "base64");

    // 1. Upload original PDF to Supabase Storage bucket 'maengelanzeige'
    const storagePath = `${projectId}/${Date.now()}_${effectiveFileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await admin.storage
      .from("maengelanzeige")
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.warn("[Mängelanzeige Scan] Storage upload warning:", uploadError.message);
    }

    // 2. Parse PDF structure and extract text page by page (instant ~0.3s)
    const { totalPages, pages } = await extractTextFromPdf(buffer);

    // 3. Create document record with status "PROCESSING"
    const { data: newDoc, error: docError } = await admin
      .from("maengelanzeige_documents")
      .insert({
        project_id: projectId,
        title: effectiveTitle,
        file_name: effectiveFileName,
        storage_bucket: "maengelanzeige",
        storage_path: storagePath,
        total_pages: totalPages,
        status: "PROCESSING",
        uploaded_by: userId,
      })
      .select()
      .single();

    if (docError || !newDoc) {
      throw new Error(`Failed to save document record: ${docError?.message || "Unknown error"}`);
    }

    // 4. Return document and extracted pages immediately (no waiting, no 504)
    return res.status(200).json({
      ok: true,
      data: {
        document: newDoc,
        totalPages,
        pages,
      },
    });
  } catch (error: any) {
    console.error("[Mängelanzeige Init Error]:", error);
    return res.status(500).json({
      ok: false,
      error: { message: error.message || "Failed to initialize Mängelanzeige document" },
    });
  }
}
