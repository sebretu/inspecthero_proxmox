import { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseAdminClient();
  const { method } = req;
  const { projectId, id } = req.query;

  if (method === "GET") {
    if (!projectId) return res.status(400).json({ ok: false, error: { message: "Missing projectId" } });
    const { data, error } = await supabase.from("cable_categories").select("*").eq("project_id", projectId);
    if (error) return res.status(500).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (method === "POST") {
    const { project_id, name, plan_id, point_a_x, point_a_y, point_a_label } = req.body;
    const { data, error } = await supabase.from("cable_categories").insert([{
      project_id, name, plan_id, point_a_x, point_a_y, point_a_label
    }]).select("*").single();
    if (error) return res.status(500).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (method === "DELETE") {
    if (!id) return res.status(400).json({ ok: false, error: { message: "Missing id" } });
    const { error } = await supabase.from("cable_categories").delete().eq("id", id);
    if (error) return res.status(500).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true, data: { success: true } });
  }

  return res.status(405).json({ ok: false, error: { message: "Method not allowed" } });
}
