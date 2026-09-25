const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const projectId = "1144f66b-b5d4-48b1-ac6f-5b38a04b59b7"; // Provided in metadata

async function debug() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  console.log("Fetching settings...");
  const { data: settings } = await supabase.from("bma_settings").select("*").eq("project_id", projectId).single();
  const scale = settings?.scale_px_per_meter || 100;
  console.log("Scale:", scale);

  console.log("Fetching routes...");
  const { data: routes } = await supabase.from("bma_routes").select("*").eq("project_id", projectId);
  console.log("Routes count:", routes?.length || 0);

  console.log("Fetching devices...");
  const { data: devices } = await supabase.from("bma_devices").select("*").eq("project_id", projectId);
  const deviceMap = new Map();
  (devices || []).forEach(d => deviceMap.set(d.id, d));

  const planMetaMap = new Map();
  
  for (const route of routes || []) {
    const planId = route.plan_id;
    if (!planMetaMap.has(planId)) {
        const metaPath = path.join(process.cwd(), "private_tiles", planId, "meta.json");
        if (fs.existsSync(metaPath)) {
            const raw = fs.readFileSync(metaPath, "utf8");
            const meta = JSON.parse(raw);
            planMetaMap.set(planId, {
              W: meta.gridW * meta.tileSize,
              H: meta.gridH * meta.tileSize
            });
            console.log(`Plan ${planId} dimensions:`, planMetaMap.get(planId));
        } else {
            console.log(`Plan ${planId} meta.json MISSING at ${metaPath}`);
        }
    }

    const planMeta = planMetaMap.get(planId);
    const src = deviceMap.get(route.source_device_id);
    const tgt = deviceMap.get(route.target_device_id);
    
    if (!planMeta || !src || !tgt) {
        console.log(`Route ${route.id} missing info: meta=${!!planMeta}, src=${!!src}, tgt=${!!tgt}`);
        continue;
    }

    const { W, H } = planMeta;
    const pts = [[src.x, src.y], ...(route.waypoints || []), [tgt.x, tgt.y]];

    let lenPx = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i+1];
      const dx = (x2 - x1) * W;
      const dy = (y2 - y1) * H;
      lenPx += Math.sqrt(dx * dx + dy * dy);
    }

    const newLen = Math.ceil((lenPx / scale) * 1.1);
    console.log(`Route ${route.id}: OldLen=${route.length_meters}, NewLen=${newLen}`);
  }
}

debug();
