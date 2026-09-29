import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

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

async function testTesseractData() {
  const { data: floorData } = await supabase
    .from("floors")
    .select("id, name, plans(id, storage_bucket, storage_path, pdf_path)")
    .ilike("name", "%grunfos%");

  const targetPlan = floorData?.[0]?.plans?.[0];
  const { data: fileBlob } = await supabase.storage
    .from(targetPlan.storage_bucket || "plans")
    .download(targetPlan.storage_path || targetPlan.pdf_path);

  const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer());
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ocr-data-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  await fs.promises.writeFile(pdfPath, pdfBuffer);

  const pngBase = path.join(tmpDir, "page");
  await execFileAsync("pdftoppm", ["-png", "-r", "150", pdfPath, pngBase]);
  const pngPath = `${pngBase}-1.png`;

  const imgMeta = await sharp(pngPath).metadata();
  const imgW = imgMeta.width || 1;
  const imgH = imgMeta.height || 1;

  const worker = await createWorker('deu+eng');
  const ret = await worker.recognize(pngPath);
  await worker.terminate();

  console.log("ret.data keys:", Object.keys(ret.data));
  console.log("ret.data.lines:", Array.isArray(ret.data.lines), ret.data.lines?.length);
  console.log("ret.data.words:", Array.isArray(ret.data.words), ret.data.words?.length);

  const lines = ret.data.text.split("\n");
  console.log(`Extracted ${lines.length} lines of text:`);

  const deviceRegex = /((?:[3-7]\d{2}|\d{2})[./-]\d{1,2}|s\d{1,2}(?!\d)|(?:BMZ|FIZ)(?!\d))/gi;
  const loopDeviceRegex = /((?:[A-Z]{1,3})?\s*\d{1,4}(?:\s*[./-]\s*\d{1,4}){1,3}|[A-Z]{1,3}\s*\d{1,4}|PA10\s*S\d|BMA|BMZ|FIZ|HM|ÜG|FSD|SDA|NSL|\bS\d{1,4}\b)/gi;

  const detected = [];
  lines.forEach((line, idx) => {
    const matches = [...line.matchAll(deviceRegex), ...line.matchAll(loopDeviceRegex)];
    for (const m of matches) {
      detected.push({
        name: m[0].trim().toUpperCase(),
        line: line.trim(),
        lineIdx: idx
      });
    }
  });

  console.log(`\nFound ${detected.length} BMA device matches in OCR text lines:`);
  console.log(detected);

  await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}

testTesseractData();
