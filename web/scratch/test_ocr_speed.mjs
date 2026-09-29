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

async function testSpeed96() {
  console.log("=== TESTING OCR SPEED WITH 96 DPI ===");
  const { data: floorData } = await supabase
    .from("floors")
    .select("id, name, plans(id, storage_bucket, storage_path, pdf_path)")
    .ilike("name", "%grunfos%");

  const targetPlan = floorData?.[0]?.plans?.[0];
  const { data: fileBlob } = await supabase.storage
    .from(targetPlan.storage_bucket || "plans")
    .download(targetPlan.storage_path || targetPlan.pdf_path);

  const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer());
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ocr-speed96-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  await fs.promises.writeFile(pdfPath, pdfBuffer);

  const rawPngBase = path.join(tmpDir, "raw_page");
  const t0 = Date.now();
  await execFileAsync("pdftoppm", ["-png", "-r", "96", pdfPath, rawPngBase]);
  const rawPng = `${rawPngBase}-1.png`;
  const tRender = Date.now() - t0;
  console.log(`Rendered PDF to 96 DPI PNG in ${tRender}ms.`);

  const t1 = Date.now();
  const worker = await createWorker('deu+eng');
  const { data: ocrData } = await worker.recognize(rawPng);
  await worker.terminate();
  const tOcr = Date.now() - t1;

  console.log(`Tesseract OCR on 96 DPI image took: ${tOcr}ms (${(tOcr / 1000).toFixed(2)}s).`);
  console.log(`Extracted text length: ${ocrData.text.length} chars.`);

  const industrialRegex = /((?:[3-7]\d{2}|\d{2})[./-]\d{1,2}|s\d{1,2}(?!\d)|(?:BMZ|FIZ)(?!\d))/gi;
  const loopDeviceRegex = /((?:[A-Z]{1,3})?\s*\d{1,4}(?:\s*[./-]\s*\d{1,4}){1,3}|[A-Z]{1,3}\s*\d{1,4}|PA10\s*S\d|BMA|BMZ|FIZ|HM|ÜG|FSD|SDA|NSL|\bS\d{1,4}\b)/gi;

  const lines = (ocrData.text || "").split("\n");
  const matches = [];
  lines.forEach((l) => {
    const m = [...l.matchAll(industrialRegex), ...l.matchAll(loopDeviceRegex)];
    m.forEach((match) => matches.push(match[0].trim().toUpperCase()));
  });

  console.log(`Found ${matches.length} BMA devices in ${tOcr + tRender}ms total!`);
  console.log("Sample matches:", matches.slice(0, 20));

  await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}

testSpeed96();
