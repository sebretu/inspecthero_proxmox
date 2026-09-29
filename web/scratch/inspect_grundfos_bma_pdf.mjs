import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

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

async function inspectGrundfosPdf() {
  console.log("=== INSPECTING GRUNFOS OG BMA PLAN PDF ===");

  // Find plan for Floor "Grunfos OG BMA"
  const { data: floorData } = await supabase
    .from("floors")
    .select("id, name, plans(id, storage_bucket, storage_path, pdf_path)")
    .ilike("name", "%grunfos%");

  console.log("Found floors matching 'grunfos':", JSON.stringify(floorData, null, 2));

  let targetPlan = null;
  if (floorData && floorData.length > 0 && floorData[0].plans && floorData[0].plans.length > 0) {
    targetPlan = floorData[0].plans[0];
  } else {
    // Fallback: take latest plan
    const { data: latestPlans } = await supabase
      .from("plans")
      .select("id, storage_bucket, storage_path, pdf_path")
      .order("created_at", { ascending: false })
      .limit(1);
    targetPlan = latestPlans?.[0];
  }

  if (!targetPlan) {
    console.error("No plan found!");
    return;
  }

  const bucket = targetPlan.storage_bucket || "plans";
  const storagePath = targetPlan.storage_path || targetPlan.pdf_path;

  console.log(`Downloading PDF from bucket '${bucket}', path '${storagePath}'...`);
  const { data: fileBlob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);

  if (dlErr || !fileBlob) {
    console.error("Download failed:", dlErr);
    return;
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  console.log(`PDF Downloaded successfully! Size: ${buffer.length} bytes.`);

  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  console.log(`PDF Pages: ${pdf.numPages}`);

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    console.log(`\nPage ${pageNum} Total Text Items: ${textContent.items.length}`);

    const strings = textContent.items.map(item => item.str || "").filter(Boolean);
    
    if (strings.length === 0) {
      console.log(`⚠️ Page ${pageNum} HAS ZERO TEXT ITEMS IN PDF TEXT LAYER! (Vector Image / Scanned Raster PDF)`);
    } else {
      console.log(`Sample strings (first 40 items):`);
      console.log(strings.slice(0, 40));

      const fullText = strings.join(" ");

      // Test Regex in scan.ts:
      const industrialRegex = /((?:[3-7]\d{2}|\d{2})[./-]\d{1,2}|s\d{1,2}(?!\d)|(?:BMZ|FIZ)(?!\d))/gi;
      const matchesScanTs = [...fullText.matchAll(industrialRegex)];
      console.log(`\nMatches via scan.ts regex (/((?:[3-7]\\d{2}|\\d{2})[./-]\\d{1,2}|s\\d{1,2}...)/gi): ${matchesScanTs.length}`);
      console.log(matchesScanTs.map(m => m[0]).slice(0, 30));

      // Test Regex in scan-loops.ts:
      const loopDeviceRegex = /((?:[A-Z]{1,3})?\s*\d{1,4}(?:\s*[./]\s*\d{1,4}){1,3}|[A-Z]{1,3}\s*\d{1,4}|PA10\s*S\d|BMA|BMZ|FIZ|HM|ÜG|FSD|SDA|NSL|\bS\d{1,4}\b)/gi;
      const matchesLoopTs = [...fullText.matchAll(loopDeviceRegex)];
      console.log(`Matches via scan-loops.ts regex: ${matchesLoopTs.length}`);
      console.log(matchesLoopTs.map(m => m[0]).slice(0, 30));

      // Test general device/circuit numbers
      const generalRegex = /\b([A-Z]{1,4}\s*\d+|\d{1,3}[./-]\d{1,3}|\d{1,4})\b/g;
      const mGeneral = [...fullText.matchAll(generalRegex)];
      console.log(`Matches via General Device regex: ${mGeneral.length}`);
      console.log(mGeneral.map(m => m[0]).slice(0, 30));
    }
  }
}

inspectGrundfosPdf();
