import { getSupabaseAdminClient } from '../src/lib/supabaseAdmin';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function run() {
  const projectId = '76530312-bc7b-4681-a760-84c0c7765084';
  const admin = getSupabaseAdminClient();

  const { data: settings } = await admin.from("bma_settings").select("*").eq("project_id", projectId).single();
  const scale = settings?.scale_px_per_meter || 100;
  
  const { data: routes } = await admin.from("bma_routes").select("*").eq("project_id", projectId);
  if (!routes || routes.length === 0) {
    console.log('No routes found.');
    return;
  }

  const { data: devices } = await admin.from("bma_devices").select("*").eq("project_id", projectId);
  const deviceMap = new Map();
  devices?.forEach((d: any) => deviceMap.set(d.id, d));

  const { data: plans } = await admin.from("plans").select("id, image_width, image_height").eq("project_id", projectId);
  const planDimMap = new Map();
  plans?.forEach((p: any) => planDimMap.set(p.id, { W: p.image_width || 1000, H: p.image_height || 1000 }));

  const planMetaMap = new Map();
  const updates = [];

  for (const route of routes) {
    const src = deviceMap.get(route.source_device_id);
    const tgt = deviceMap.get(route.target_device_id);
    if (!src || !tgt) continue;

    const planId = src.plan_id;
    if (!planId) continue;

    if (!planMetaMap.has(planId)) {
      const dbDims = planDimMap.get(planId) || { W: 1000, H: 1000 };
      planMetaMap.set(planId, dbDims);
      try {
        const metaPath = path.join(process.cwd(), "public", "tiles", planId, "meta.json");
        const raw = await fs.readFile(metaPath, "utf8");
        const meta = JSON.parse(raw);
        planMetaMap.set(planId, { W: meta.gridW * meta.tileSize, H: meta.gridH * meta.tileSize });
      } catch (e) {}
    }

    const { W, H } = planMetaMap.get(planId);
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
    updates.push({ id: route.id, length_meters: newLen });
  }

  console.log(`Updating ${updates.length} routes...`);
  for (const up of updates) {
    await admin.from("bma_routes").update({ length_meters: up.length_meters }).eq("id", up.id);
  }
  console.log('Done.');
}

run();
