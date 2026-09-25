import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import fs from "fs/promises";
import path from "path";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const projectId = String(req.query.projectId || "").trim();
  console.log(`[recalculate-routes] Recalculating for projectId: ${projectId}`);
  if (!projectId) return res.status(400).json({ ok: false, error: "Missing projectId" });

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const admin = getSupabaseAdminClient();

    // 1. Get settings (scale)
    const { data: settings } = await admin.from("bma_settings").select("*").eq("project_id", projectId).single();
    const scale = settings?.scale_px_per_meter || 100;
    console.log(`[recalculate-routes] Found scale: ${scale}`);

    // 2. Get all routes for the project
    const { data: routes } = await admin.from("bma_routes").select("*").eq("project_id", projectId);
    console.log(`[recalculate-routes] Found ${routes?.length || 0} routes`);
    if (!routes || routes.length === 0) return res.status(200).json({ ok: true, count: 0 });

    // 3. Get all devices for the project
    const { data: devices } = await admin.from("bma_devices").select("*").eq("project_id", projectId);
    console.log(`[recalculate-routes] Found ${devices?.length || 0} devices`);
    const deviceMap = new Map();
    (devices || []).forEach((d: any) => deviceMap.set(d.id, d));

    // 4. Get all plans for dimensions
    const { data: plans } = await admin.from("plans").select("id, image_width, image_height").eq("project_id", projectId);
    const planDimMap = new Map();
    (plans || []).forEach((p: any) => planDimMap.set(p.id, { W: p.image_width || 1000, H: p.image_height || 1000 }));

    const planMetaMap = new Map();
    const updates = [];

    for (const route of routes) {
      const src = deviceMap.get(route.source_device_id);
      const tgt = deviceMap.get(route.target_device_id);
      
      if (!src || !tgt) continue;

      const planId = src.plan_id;
      if (!planId) continue;

      // Try to get meta.json for potentially more accurate grid-based dimensions
      if (!planMetaMap.has(planId)) {
        // Start with DB defaults
        const dbDims = planDimMap.get(planId) || { W: 1000, H: 1000 };
        planMetaMap.set(planId, dbDims);

        try {
          const metaPath = path.join(process.cwd(), "public", "tiles", planId, "meta.json");
          const raw = await fs.readFile(metaPath, "utf8");
          const meta = JSON.parse(raw);
          planMetaMap.set(planId, {
            W: meta.gridW * meta.tileSize,
            H: meta.gridH * meta.tileSize
          });
          console.log(`[recalculate-routes] Using meta.json for plan ${planId}`);
        } catch (e) {
          console.warn(`[recalculate-routes] Using database fallback for plan ${planId}`);
        }
      }

      const planMeta = planMetaMap.get(planId);
      if (!planMeta) continue;

      const { W, H } = planMeta;
      
      const pts = [
        [src.x, src.y],
        ...(route.waypoints || []),
        [tgt.x, tgt.y]
      ];

      let lenPx = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i+1];
        const dx = (x2 - x1) * W;
        const dy = (y2 - y1) * H;
        lenPx += Math.sqrt(dx * dx + dy * dy);
      }

      // Calculate meters based on pixels and scale
      const newLen = Math.ceil((lenPx / scale) * 1.1);
      updates.push({ id: route.id, length_meters: newLen });
    }

    // 5. Bulk update (using admin client)
    for (const up of updates) {
      await admin.from("bma_routes").update({ length_meters: up.length_meters }).eq("id", up.id);
    }

    return res.status(200).json({ ok: true, count: updates.length });
  } catch (err: any) {
    console.error("Recalculate error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
