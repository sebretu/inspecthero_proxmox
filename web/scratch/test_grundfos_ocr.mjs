import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createWorker } from "tesseract.js";

const execFileAsync = promisify(execFile);

const ENV_PATH = "/home/ubuntu/inspecthero-web.env";
const envVars = {};
if (fs.existsSync(ENV_PATH)) {
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [k, v] = trimmed.split("=", 2);
      envVars[k.trim()] = v.trim();
    }
  });
}

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testGrundfosOcr() {
  console.log("=== TESTING OCR FALLBACK ON GRUNFOS OG BMA PLAN ===");

  const { data: floorData } = await supabase
    .from("floors")
    .select("id, name, plans(id, storage_bucket, storage_path, pdf_path)")
    .ilike("name", "%grunfos%");

  const targetPlan = floorData?.[0]?.plans?.[0];
  if (!targetPlan) {
    console.error("Plan not found");
    return;
  }

  const { data: fileBlob } = await supabase.storage
    .from(targetPlan.storage_bucket || "plans")
    .download(targetPlan.storage_path || targetPlan.pdf_path);

  if (!fileBlob) return;

  const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer());
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ocr-test-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  await fs.promises.writeFile(pdfPath, pdfBuffer);

  const pngBase = path.join(tmpDir, "page");
  console.log("Rendering PDF page 1 to PNG via pdftoppm (150 DPI)...");
  await execFileAsync("pdftoppm", ["-png", "-r", "150", pdfPath, pngBase]);

  const pngPath = `${pngBase}-1.png`;
  console.log(`Rendered PNG: ${pngPath}`);

  console.log("Running Tesseract OCR (ger+deu+eng)...");
  const worker = await createWorker('deu+eng');
  const { data } = await worker.recognize(pngPath);
  await worker.terminate();

  console.log(`\nOCR Extracted Text Length: ${data.text.length} chars.`);
  console.log("Sample OCR Text (first 500 chars):");
  console.log(data.text.slice(0, 500));

  // Device patterns in BMA
  const patterns = [
    /((?:[3-7]\d{2}|\d{2})[./-]\d{1,2}|s\d{1,2}(?!\d)|(?:BMZ|FIZ)(?!\d))/gi,
    /((?:[A-Z]{1,3})?\s*\d{1,4}(?:\s*[./-]\s*\d{1,4}){1,3}|[A-Z]{1,3}\s*\d{1,4}|PA10\s*S\d|BMA|BMZ|FIZ|HM|ÜG|FSD|SDA|NSL|\bS\d{1,4}\b)/gi,
    /\b([A-Z]{0,3}\s*\d{1,4}[./-]\d{1,4})\b/g
  ];

  for (let pIdx = 0; pIdx < patterns.length; pIdx++) {
    const matches = [...data.text.matchAll(patterns[pIdx])];
    console.log(`\nPattern ${pIdx + 1} matches count: ${matches.length}`);
    console.log(matches.map(m => m[0]).slice(0, 30));
  }

  // Cleanup
  await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}

testGrundfosOcr();
