import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  let userId;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "Missing projectId" });

  if (req.method === "GET") {
    const { data, error } = await supabase.from("bma_settings").select("*").eq("project_id", projectId).single();
    if (error && error.code !== "PGRST116") return res.status(400).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, data: data || { project_id: projectId, device_regex: "(\\d{2}/\\d{2}|PA10\\sS\\d|BMA|BMZ|FIZ|HM|ÜG)", scale_px_per_meter: 100 } });
  }

  if (req.method === "POST" || req.method === "PATCH") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { data, error } = await supabase.from("bma_settings").upsert({
      project_id: projectId,
      ...body,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' }).select("*").single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, data });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
