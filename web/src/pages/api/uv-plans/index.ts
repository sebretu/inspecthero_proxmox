import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { UVPlan, UVPlanCircuit, UVPlanLocation } from "@/types/uvPlans";
export type { UVPlan, UVPlanCircuit, UVPlanLocation };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  if (!userId) {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  const admin = getSupabaseAdminClient();

  // GET: Fetch all UV plans for a project
  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) {
      return res.status(400).json({ ok: false, error: { message: "Missing projectId" } });
    }

    try {
      const { data, error } = await admin
        .from("uv_plans")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (error) {
        return res.status(500).json({ ok: false, error: { message: error.message } });
      }

      return res.status(200).json({ ok: true, data: data || [] });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // POST: Create a new UV plan
  if (req.method === "POST") {
    const { projectId, name, pdfFilename, circuits, color, location } = req.body || {};
    if (!projectId || !name) {
      return res.status(400).json({ ok: false, error: { message: "Missing projectId or name" } });
    }

    try {
      const { data, error } = await admin
        .from("uv_plans")
        .insert({
          project_id: projectId,
          name: name.trim(),
          pdf_filename: pdfFilename || null,
          circuits: Array.isArray(circuits) ? circuits : [],
          color: color || "#3b82f6",
          location: location || null,
          created_by: userId
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ ok: false, error: { message: error.message } });
      }

      return res.status(200).json({ ok: true, data });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // PATCH: Update UV plan (name, circuits, color, location)
  if (req.method === "PATCH") {
    const { id, name, circuits, color, location } = req.body || {};
    if (!id) {
      return res.status(400).json({ ok: false, error: { message: "Missing UV plan id" } });
    }

    try {
      const updateData: any = { updated_at: new Date().toISOString() };
      if (name !== undefined) updateData.name = String(name).trim();
      if (circuits !== undefined && Array.isArray(circuits)) updateData.circuits = circuits;
      if (color !== undefined) updateData.color = String(color).trim();
      if (location !== undefined) updateData.location = location;

      const { data, error } = await admin
        .from("uv_plans")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ ok: false, error: { message: error.message } });
      }

      return res.status(200).json({ ok: true, data });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // DELETE: Delete UV plan
  if (req.method === "DELETE") {
    const id = String(req.query.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: { message: "Missing UV plan id" } });
    }

    try {
      const { error } = await admin.from("uv_plans").delete().eq("id", id);
      if (error) {
        return res.status(500).json({ ok: false, error: { message: error.message } });
      }

      return res.status(200).json({ ok: true, message: "UV plan deleted successfully" });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).json({ ok: false, error: { message: "Method Not Allowed" } });
}
