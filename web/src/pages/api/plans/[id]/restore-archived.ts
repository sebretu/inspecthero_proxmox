import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import path from "path";
import fs from "fs";
import { takePlanCoordinateSnapshot, restorePlanCoordinateSnapshot, invertMatrix } from "@/lib/transformUtils";

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

  if (!planId || !versionId) return res.status(400).json({ error: "Missing planId or versionId" });

  const adminClient = getSupabaseAdminClient();

  try {
    // 1. Fetch the archived version to restore
    const { data: archiveVersion, error: archiveErr } = await adminClient
      .from("plan_versions")
      .select("id, status, version_number, coordinate_snapshot, transformation_model, file_url, width_px, height_px")
      .eq("id", versionId)
      .eq("plan_id", planId)
      .single();

    if (archiveErr || !archiveVersion) return res.status(404).json({ error: "Version not found" });
    if (archiveVersion.status !== "archived") {
      return res.status(400).json({ error: "Only archived versions can be restored." });
    }

    // 2. Check if tiles exist for this archived version
    const webRoot = process.cwd();
    const archivedTilesDir = path.join(webRoot, "private_tiles", versionId);
    const hasTiles = fs.existsSync(archivedTilesDir);
    if (!hasTiles) {
      return res.status(400).json({ error: "Cannot restore: tile files for this archived version have been deleted. The tiles no longer exist on disk." });
    }

    // 3. Fetch current active version (may not exist for legacy plans)
    const { data: currentActive } = await adminClient
      .from("plan_versions")
      .select("id, version_number")
      .eq("plan_id", planId)
      .eq("status", "active")
      .maybeSingle(); // Use maybeSingle instead of single - it's OK if there's no active version

    // 4. If there's a current active DB record, archive it first and snapshot coordinates
    if (currentActive) {
      try {
        const activeSnapshot = await takePlanCoordinateSnapshot(planId, adminClient);
        const { error: archiveCurrentErr } = await adminClient
          .from("plan_versions")
          .update({ 
            status: "archived",
            coordinate_snapshot: activeSnapshot
          })
          .eq("id", currentActive.id);

        if (archiveCurrentErr) return res.status(500).json({ error: `Failed to archive current: ${archiveCurrentErr.message}` });
      } catch (snapErr: any) {
        console.error("[restore-archived] Failed to save snapshot for displaced version:", snapErr);
        const { error: archiveCurrentErr } = await adminClient
          .from("plan_versions")
          .update({ status: "archived" })
          .eq("id", currentActive.id);
        if (archiveCurrentErr) return res.status(500).json({ error: `Failed to archive current: ${archiveCurrentErr.message}` });
      }
    }

    // 5. Activate the target version
    const { error: activateErr } = await adminClient
      .from("plan_versions")
      .update({ status: "active" })
      .eq("id", versionId);

    if (activateErr) {
      // Rollback: un-archive current if we archived it
      if (currentActive) {
        await adminClient.from("plan_versions").update({ status: "active" }).eq("id", currentActive.id);
      }
      return res.status(500).json({ error: `Failed to activate version: ${activateErr.message}` });
    }

    // Update main plan fields (legacy compatibility)
    const { error: planUpdateErr } = await adminClient
      .from("plans")
      .update({
        version: archiveVersion.version_number,
        pdf_path: archiveVersion.file_url,
        image_width: archiveVersion.width_px,
        image_height: archiveVersion.height_px,
        updated_at: new Date().toISOString()
      })
      .eq("id", planId);

    if (planUpdateErr) {
      console.error("[restore-archived] Failed to update main plan record:", planUpdateErr);
    }

    // 5.5 Restore target version coordinates
    try {
      let transformMatrix = null;
      if (currentActive) {
        const { data: currentFull } = await adminClient
          .from("plan_versions")
          .select("version_number, transformation_model")
          .eq("id", currentActive.id)
          .single();

        if (archiveVersion.version_number > currentActive.version_number) {
          // Going forward: apply archiveVersion's forward matrix
          transformMatrix = archiveVersion.transformation_model?.matrix || null;
        } else if (archiveVersion.version_number < currentActive.version_number) {
          // Rolling back: apply inverse of currentActive's matrix
          const matrix = currentFull?.transformation_model?.matrix;
          if (matrix) {
            transformMatrix = invertMatrix(matrix);
          }
        }
      }

      await restorePlanCoordinateSnapshot(
        planId,
        archiveVersion.coordinate_snapshot,
        transformMatrix,
        adminClient
      );
    } catch (restoreErr: any) {
      console.error("[restore-archived] Failed to restore coordinates:", restoreErr);
    }

    // 6. Swap tile folders on disk
    // current active tiles: private_tiles/[planId] → rename to private_tiles/[currentActive.id] (if exists)
    // archived tiles: private_tiles/[versionId] → rename to private_tiles/[planId]
    const activeTilesDir = path.join(webRoot, "private_tiles", planId);

    try {
      // Only back up current tiles if we have a DB record to associate them with
      if (currentActive && fs.existsSync(activeTilesDir)) {
        const currentBackupDir = path.join(webRoot, "private_tiles", currentActive.id);
        fs.renameSync(activeTilesDir, currentBackupDir);
      } else if (!currentActive && fs.existsSync(activeTilesDir)) {
        // No active DB record: just remove/rename old tiles without a backup reference
        const orphanBackupDir = path.join(webRoot, "private_tiles", `${planId}_orphan_backup`);
        fs.renameSync(activeTilesDir, orphanBackupDir);
      }
      fs.renameSync(archivedTilesDir, activeTilesDir);
    } catch (fsErr: any) {
      console.error("[restore-archived] FS swap failed:", fsErr);
      // Rollback DB if FS fails
      if (currentActive) {
        await adminClient.from("plan_versions").update({ status: "active" }).eq("id", currentActive.id);
      }
      await adminClient.from("plan_versions").update({ status: "archived" }).eq("id", versionId);
      return res.status(500).json({ error: `Tile swap failed: ${fsErr.message}` });
    }

    // 7. Audit event
    try {
      await adminClient.from("audit_events").insert({
        event_type: "archived_version_restored",
        user_id: user.id,
        resource_id: planId,
        resource_type: "plan",
        metadata: {
          restored_version_id: versionId,
          restored_version_number: archiveVersion.version_number,
          displaced_version_id: currentActive?.id ?? null,
          displaced_version_number: currentActive?.version_number ?? null,
        }
      });
    } catch (_) {}

    return res.status(200).json({ ok: true, message: `Version V${archiveVersion.version_number} restored successfully.` });
  } catch (err: any) {
    console.error("[restore-archived] error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
