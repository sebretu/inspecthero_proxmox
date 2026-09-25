import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  if (req.method === "GET") {
    const pId = Array.isArray(req.query.projectId) ? req.query.projectId[0] : req.query.projectId;
    const plId = Array.isArray(req.query.planId) ? req.query.planId[0] : req.query.planId;
    if (!pId || !plId) return res.status(400).json({ ok: false, error: { message: "Missing projectId or planId" } });

    // Verify access to project
    const { data: proj, error: projErr } = await supabase.from("projects").select("id").eq("id", pId).single();
    if (projErr || !proj) return res.status(403).json({ ok: false, error: { message: "Access denied" } });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("stromkreis_snapshots")
      .select("id, name, created_at")
      .eq("project_id", pId)
      .eq("plan_id", plId)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "POST") {
    const { projectId, planId, name } = req.body;
    if (!projectId || !planId || !name) return res.status(400).json({ ok: false, error: { message: "Missing data" } });

    const admin = getSupabaseAdminClient();
    
    // Fetch all current markers for this plan to save in the snapshot
    const { data: markers, error: fetchErr } = await admin
      .from("stromkreise")
      .select("*")
      .eq("project_id", projectId)
      .eq("plan_id", planId);

    if (fetchErr) return res.status(500).json({ ok: false, error: { message: fetchErr.message } });

    const snapshotData = { markers: markers || [] };

    const { data: snapshot, error: insertErr } = await admin
      .from("stromkreis_snapshots")
      .insert({
        project_id: projectId,
        plan_id: planId,
        name,
        data: snapshotData,
        created_by: userId
      })
      .select()
      .single();

    if (insertErr) return res.status(500).json({ ok: false, error: { message: insertErr.message } });
    return res.status(200).json({ ok: true, data: snapshot });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ ok: false, error: { message: "Missing id" } });

    const { error } = await supabase.from("stromkreis_snapshots").delete().eq("id", id);
    if (error) return res.status(500).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  return res.status(405).end();
}
