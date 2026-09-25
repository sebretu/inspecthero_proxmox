import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  try {
    await requireRequesterProfile(supabase, userId);
  } catch {
    return res.status(403).json({ ok: false, error: { message: "Profile error" } });
  }

  const { snapshotId, projectId, planId } = req.body;
  if (!snapshotId || !projectId || !planId) {
    return res.status(400).json({ ok: false, error: { message: "Missing required fields" } });
  }

  const admin = getSupabaseAdminClient();

  // 1. Fetch the target snapshot
  const { data: targetSnapshot, error: snapErr } = await admin
    .from("stromkreis_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .single();

  if (snapErr || !targetSnapshot) {
    return res.status(404).json({ ok: false, error: { message: "Snapshot not found" } });
  }

  // 2. Fetch current markers for auto-backup
  const { data: currentMarkers, error: fetchErr } = await admin
    .from("stromkreise")
    .select("*")
    .eq("project_id", projectId)
    .eq("plan_id", planId);

  if (fetchErr) {
    return res.status(500).json({ ok: false, error: { message: "Failed to fetch current markers for backup" } });
  }

  // 3. Create auto-backup snapshot
  const now = new Date();
  // Format: Backup YYYY-MM-DD HH:MM
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);
  const backupName = `Backup ${dateStr} ${timeStr}`;

  const { error: backupErr } = await admin
    .from("stromkreis_snapshots")
    .insert({
      project_id: projectId,
      plan_id: planId,
      name: backupName,
      data: { markers: currentMarkers || [] },
      created_by: userId
    });

  if (backupErr) {
    return res.status(500).json({ ok: false, error: { message: "Failed to create auto-backup: " + backupErr.message } });
  }

  // 4. Delete current markers
  const { error: delErr } = await admin
    .from("stromkreise")
    .delete()
    .eq("project_id", projectId)
    .eq("plan_id", planId);

  if (delErr) {
    return res.status(500).json({ ok: false, error: { message: "Failed to delete current markers: " + delErr.message } });
  }

  // 5. Insert markers from the target snapshot
  const newMarkers = targetSnapshot.data.markers || [];
  if (newMarkers.length > 0) {
    // Remove IDs so they are inserted as new rows
    const markersToInsert = newMarkers.map((m: any) => {
      const { id, created_at, ...rest } = m;

      // Clean/map old snapshots that might have direct 'text', 'line', 'arrow' values
      if (rest.type === "line" || rest.type === "arrow" || rest.type === "text") {
        rest.metadata = rest.metadata || {};
        rest.metadata.realType = rest.type;
        rest.type = rest.type === "text" ? "special" : "socket";
      }
      if (rest.marker_shape === "line" || rest.marker_shape === "arrow" || rest.marker_shape === "text") {
        rest.metadata = rest.metadata || {};
        rest.metadata.realType = rest.marker_shape;
        rest.marker_shape = "circle";
      }

      return rest;
    });

    const { error: insErr } = await admin
      .from("stromkreise")
      .insert(markersToInsert);

    if (insErr) {
      return res.status(500).json({ ok: false, error: { message: "Failed to insert snapshot markers: " + insErr.message } });
    }
  }

  return res.status(200).json({ ok: true });
}
