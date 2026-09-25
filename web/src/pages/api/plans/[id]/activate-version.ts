import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { applyTransformMatrixToPlan, takePlanCoordinateSnapshot } from "@/lib/transformUtils";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.authorization || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ error: "AUTH_INVALID" });

  const planId = req.query.id as string;
  const { versionId } = req.body;

  const adminClient = getSupabaseAdminClient();

  let finalVersionId = versionId;
  if (!finalVersionId) {
    const { data: draft } = await adminClient.from("plan_versions")
      .select("id").eq("plan_id", planId).eq("status", "needs_alignment").single();
    if (draft) finalVersionId = draft.id;
  }

  if (!planId || !finalVersionId) {
    return res.status(400).json({ error: "Missing planId or versionId" });
  }

  try {
    // 1. Fetch the Draft Version
    let { data: draftVersion, error: draftErr } = await adminClient
      .from('plan_versions')
      .select('id, width_px, height_px, transformation_model')
      .eq('id', finalVersionId)
      .single();

    if (draftErr || !draftVersion) return res.status(404).json({ error: "Draft version not found" });

    // Wait for background tile generation to complete if needed
    for (let i = 0; i < 40; i++) {
      if (draftVersion.width_px && draftVersion.height_px) {
        break;
      }
      console.log(`[activate-version] Waiting for tiles to finish generating for version ${finalVersionId} (attempt ${i + 1})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data: updatedVersion } = await adminClient
        .from('plan_versions')
        .select('id, width_px, height_px, transformation_model')
        .eq('id', finalVersionId)
        .single();
      if (updatedVersion) {
        draftVersion = updatedVersion;
      }
    }

    // 2. Fetch current active version to get entity locations
    const { data: activeVersion, error: activeErr } = await adminClient
      .from('plan_versions')
      .select('id')
      .eq('plan_id', planId)
      .eq('status', 'active')
      .single();

    if (activeErr || !activeVersion) return res.status(400).json({ error: "No active version to migrate from" });

    // 3. Take coordinate snapshot of current active version before shifting
    try {
      const coordSnapshot = await takePlanCoordinateSnapshot(planId, adminClient);
      await adminClient
        .from("plan_versions")
        .update({ coordinate_snapshot: coordSnapshot })
        .eq("id", activeVersion.id);
    } catch (snapErr: any) {
      console.error("[activate-version] Failed to save coordinate snapshot:", snapErr);
    }

    // 4. Fetch current entity locations
    const { data: currentLocations, error: locErr } = await adminClient
      .from('entity_locations')
      .select('entity_id, x_norm, y_norm')
      .eq('plan_version_id', activeVersion.id)
      .eq('is_orphaned', false);

    if (locErr) return res.status(500).json({ error: "Failed to fetch entity locations" });

    // We now update markers directly in their tables instead of entity_locations MVP
    const tModel = draftVersion.transformation_model;
    if (tModel && tModel.matrix) {
       await applyTransformMatrixToPlan(planId, tModel, adminClient);
    }

    // 5. Call the atomic RPC to apply the activation
    const { data: rpcData, error: rpcErr } = await adminClient.rpc('activate_plan_version', {
      p_plan_id: planId,
      p_version_id: finalVersionId,
      p_user_id: user.id,
      p_locations: []
    });

    if (rpcErr) {
      console.error("[activate-version] RPC Error:", rpcErr);
      return res.status(500).json({ error: rpcErr.message });
    }

    if (!rpcData.success) {
      return res.status(400).json({ error: rpcData.message || "Activation failed" });
    }

    // 6. Swap Tile Folders on Disk
    const fsSync = require("fs");
    const path = require("path");
    const webRoot = process.cwd();
    const oldTilesDir = path.join(webRoot, "private_tiles", planId);
    const newTilesDir = path.join(webRoot, "private_tiles", finalVersionId);
    const backupTilesDir = path.join(webRoot, "private_tiles", activeVersion.id);

    try {
      if (fsSync.existsSync(oldTilesDir)) {
         fsSync.renameSync(oldTilesDir, backupTilesDir);
      }
      if (fsSync.existsSync(newTilesDir)) {
         fsSync.renameSync(newTilesDir, oldTilesDir);
      }
    } catch (fsErr) {
      console.error("[activate-version] FS Swap failed:", fsErr);
    }

    return res.status(200).json({ ok: true, data: rpcData });
  } catch (err: any) {
    console.error("[activate-version] Internal error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
