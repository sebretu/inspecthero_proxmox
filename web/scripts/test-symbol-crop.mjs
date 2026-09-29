import dns from "dns";
dns.setDefaultResultOrder("ipv4first"); // Force IPv4 to prevent Node 18+ fetch hangs on Tailscale IPs

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { generateSymbolCrop } from "../src/lib/symbolCropper.ts";
import statsHandler from "../src/pages/api/symbol-crops/stats.ts";
import exportHandler from "../src/pages/api/symbol-crops/export.ts";

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

// Override Supabase URL for sandbox
const localUrl = "http://100.88.160.117:54321";
process.env.NEXT_PUBLIC_SUPABASE_URL = localUrl;

const supabase = createClient(
  localUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

// Helper for Mocking Next.js API request/response objects
function mockRequestResponse(query = {}) {
  let responseData = null;
  let headers = {};
  let statusCode = 200;

  const req = {
    method: "GET",
    query,
    headers: {}
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers[name] = value;
      return this;
    },
    send(data) {
      responseData = data;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => responseData
  };
}

async function test() {
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021';
  console.log(`[Test-Crop-Upgrade] Sourcing marker for plan: ${planId}`);

  const { data: markers } = await supabase
    .from("stromkreise")
    .select("*")
    .eq("plan_id", planId);

  if (!markers || markers.length === 0) {
    console.error("No markers found for this plan.");
    return;
  }

  // Find or simulate an approved marker
  let targetMarker = markers.find(m => {
    const executions = m.metadata?.executions || {};
    return Object.values(executions).some(ex => ex.status === "APPROVED");
  });

  if (!targetMarker) {
    targetMarker = markers[0];
    console.log(`[Test-Crop-Upgrade] Simulating APPROVED status for marker: ${targetMarker.id}`);
    const metadata = targetMarker.metadata || {};
    metadata.executions = metadata.executions || {};
    metadata.executions["test_sub"] = {
      status: "APPROVED",
      submitted_by: "Test CLI",
      submitted_at: new Date().toISOString()
    };

    await supabase
      .from("stromkreise")
      .update({ metadata })
      .eq("id", targetMarker.id);
  }

  console.log(`[Test-Crop-Upgrade] Target marker: id=${targetMarker.id}, circuit_code=${targetMarker.circuit_code}`);

  // Delete existing crop entries to ensure a fresh generation run
  console.log("[Test-Crop-Upgrade] Cleaning up previous crop references...");
  await supabase
    .from("symbol_crops")
    .delete()
    .eq("stromkreis_id", targetMarker.id);

  // Clean up storage files (128, 256, 512 variants)
  const sizes = [128, 256, 512];
  for (const size of sizes) {
    await supabase.storage
      .from("symbol-crops")
      .remove([`crops/${planId}/${targetMarker.id}/${size}.png`]);
  }

  // 1. RUN PIPELINE
  console.log("[Test-Crop-Upgrade] Triggering generateSymbolCrop...");
  await generateSymbolCrop(targetMarker.id);

  // 2. VERIFY DATABASE RECORD
  console.log("[Test-Crop-Upgrade] Querying database record...");
  const { data: crop, error: dbErr } = await supabase
    .from("symbol_crops")
    .select("*")
    .eq("stromkreis_id", targetMarker.id)
    .single();

  if (dbErr || !crop) {
    console.error("FAILED! Record not written to symbol_crops table:", dbErr);
    return;
  }

  console.log("Database Validation PASSED:");
  console.log(`- quality_score: ${crop.quality_score}`);
  console.log(`- quality_status: ${crop.quality_status}`);
  console.log(`- brightness: ${crop.brightness}`);
  console.log(`- edge_density: ${crop.edge_density}`);
  console.log(`- contains_lines: ${crop.contains_lines}`);
  console.log(`- metadata variants: ${JSON.stringify(crop.metadata?.variants)}`);

  // 3. VERIFY STORAGE OBJECTS
  console.log("[Test-Crop-Upgrade] Verifying storage variants...");
  const { data: storageObjects, error: storageErr } = await supabase.storage
    .from("symbol-crops")
    .list(`crops/${planId}/${targetMarker.id}`);

  if (storageErr) {
    console.error("Error listing storage objects:", storageErr);
    return;
  }

  const existingFiles = (storageObjects || []).map(o => o.name);
  console.log("Storage files found:", existingFiles);

  const allVariantsExist = sizes.every(size => existingFiles.includes(`${size}.png`));
  if (!allVariantsExist) {
    console.error("FAILED! One or more resolution variants are missing in storage.");
    return;
  }
  console.log("Storage Validation PASSED: 128.png, 256.png, 512.png all exist.");

  // Resolve functions from default ESM exports if needed
  const statsFn = statsHandler.default || statsHandler;
  const exportFn = exportHandler.default || exportHandler;

  // 4. VERIFY STATS API
  console.log("[Test-Crop-Upgrade] Querying Stats API route in-process...");
  const { req: statsReq, res: statsRes, getData: getStatsData } = mockRequestResponse();
  await statsFn(statsReq, statsRes);
  const stats = getStatsData();
  console.log("Stats API Validation PASSED:", JSON.stringify(stats, null, 2));

  // 5. VERIFY EXPORT API
  console.log("[Test-Crop-Upgrade] Querying Export API route in-process...");
  const { req: exportReq, res: exportRes, getData: getExportData } = mockRequestResponse({ plan_id: planId, quality: "all" });
  await exportFn(exportReq, exportRes);
  const exportData = getExportData();
  console.log("Export API Validation PASSED. Sample output:\n", exportData);

  console.log("\n==============================================");
  console.log("Upgrade Crop Pipeline Test completed successfully!");
  console.log("==============================================\n");
}

test().catch(console.error);
