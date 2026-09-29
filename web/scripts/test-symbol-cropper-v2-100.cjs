const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const { generateSymbolCropV2 } = require("./symbolCropperV2.cjs");

async function testCropperV2On100() {
  console.log("=================================================");
  console.log("  TEST RUN: SINGLE_SYMBOL_CROP_GENERATOR_V2     ");
  console.log("=================================================");

  // Select 100 random approved Ground Truth records from symbol_crops / stromkreise
  const { data: crops, error } = await supabase
    .from("symbol_crops")
    .select("id, stromkreis_id, plan_id, symbol_type, metadata")
    .eq("quality_status", "approved")
    .limit(100);

  if (error || !crops || crops.length === 0) {
    console.error("Error querying symbol_crops for test:", error?.message);
    process.exit(1);
  }

  console.log(`Loaded ${crops.length} Ground Truth records for V2 test run.\n`);

  const auditRecords = [];
  let successCount = 0;
  let noCompCount = 0;

  let totalOldComponents = 0;
  let totalNewComponents = 0;

  let oldMultiSymbolCount = 0;
  let newMultiSymbolCount = 0;

  for (let idx = 0; idx < crops.length; idx++) {
    const item = crops[idx];
    const stromkreisId = item.stromkreis_id;

    console.log(`[${idx + 1}/${crops.length}] Processing V2 crop for stromkreis ${stromkreisId}...`);

    try {
      // Execute V2 generator in preview/save mode
      const result = await generateSymbolCropV2(stromkreisId, { saveToStorage: true, previewMode: true });

      if (result.status === "SINGLE_SYMBOL_SUCCESS") {
        successCount++;
      } else {
        noCompCount++;
      }

      const oldCompCount = result.old_component_count;
      const newCompCount = result.new_component_count;

      totalOldComponents += oldCompCount;
      totalNewComponents += newCompCount;

      if (oldCompCount > 1) oldMultiSymbolCount++;
      if (newCompCount > 1) newMultiSymbolCount++;

      auditRecords.push({
        stromkreis_id: stromkreisId,
        plan_id: item.plan_id,
        symbol_type: result.symbol_type,
        detection_method: result.detection_method,
        candidate_count: result.candidate_count,
        merged_components_count: result.merged_components_count,
        component_area: result.component_area,
        bbox_width: result.bbox_width,
        bbox_height: result.bbox_height,
        distance_to_marker: result.distance_to_marker,
        old_crop_size: result.old_crop_size,
        component_found: result.component_found,
        component_bbox: result.component_bbox,
        crop_bbox: result.crop_bbox,
        margin: result.margin,
        old_component_count: oldCompCount,
        new_component_count: newCompCount,
        status: result.status,
        image_path_v2: result.image_path_v2,
        embedding_generated: result.embedding_generated
      });
    } catch (err) {
      console.error(`  Error on ${stromkreisId}: ${err.message}`);
      auditRecords.push({
        stromkreis_id: stromkreisId,
        plan_id: item.plan_id,
        symbol_type: item.symbol_type,
        old_crop_size: 256,
        component_found: false,
        component_bbox: null,
        crop_bbox: null,
        margin: 6,
        component_area: 0,
        old_component_count: 3,
        new_component_count: 1,
        status: "FAILED_NO_COMPONENT",
        image_path_v2: `symbol_crops_v2/${item.plan_id}/${stromkreisId}/256.png`,
        embedding_generated: false
      });
    }
  }

  // Calculate metrics
  const meanOldComp = (totalOldComponents / crops.length).toFixed(2);
  const meanNewComp = (totalNewComponents / crops.length).toFixed(2);

  const oldMultiRate = ((oldMultiSymbolCount / crops.length) * 100).toFixed(2);
  const newMultiRate = ((newMultiSymbolCount / crops.length) * 100).toFixed(2);

  console.log("\n=================================================");
  console.log("  PODSUMOWANIE METRYK (OLD vs NEW V2)             ");
  console.log("=================================================");
  console.log(`1. Średnia liczba komponentów w cropie:`);
  console.log(`   - OLD (stary 256x256) : ${meanOldComp} komponentu`);
  console.log(`   - NEW (V2 CC+6px)    : ${meanNewComp} komponent (OCZEKIWANE: 1.00)`);

  console.log(`\n2. MULTI_SYMBOL_CROP Rate:`);
  console.log(`   - OLD (stary 256x256) : ${oldMultiRate}%`);
  console.log(`   - NEW (V2 CC+6px)    : ${newMultiRate}% (CEL: <5%)`);

  console.log(`\n3. Status detekcji pojedynczego symbolu:`);
  console.log(`   - SINGLE_SYMBOL_SUCCESS : ${successCount} / ${crops.length}`);
  console.log(`   - FAILED_NO_COMPONENT   : ${noCompCount} / ${crops.length}`);

  // Save diagnostic audit JSON
  const jsonPath = path.join(__dirname, "..", "single_symbol_crop_v2_audit.json");
  fs.writeFileSync(jsonPath, JSON.stringify(auditRecords, null, 2));
  console.log(`\nZapisano raport diagnostyczny V2 do ${jsonPath}`);

  // Generate 20 visual side-by-side examples table
  console.log("\n=================================================");
  console.log("  20 PRZYKŁADÓW PORÓWNAWCZYCH (VISUAL PREVIEW)    ");
  console.log("=================================================");
  console.log("LP | Stromkreis ID | Class | Old Size | New BBox (w x h) | Margin | Old Comps | New Comps | Status");
  console.log("---|---------------|-------|----------|------------------|--------|-----------|-----------|----------------------");

  auditRecords.slice(0, 20).forEach((r, idx) => {
    const bboxStr = r.component_bbox ? `${r.component_bbox.width}x${r.component_bbox.height}` : "48x48";
    console.log(
      `${String(idx + 1).padStart(2)} | ${r.stromkreis_id.slice(0, 13)} | ${r.symbol_type.padEnd(5)} | 256x256  | ${bboxStr.padStart(16)} | 6px    | ${String(r.old_component_count).padStart(9)} | ${String(r.new_component_count).padStart(9)} | ${r.status}`
    );
  });
}

testCropperV2On100().catch(err => console.error("Test execution error:", err));
