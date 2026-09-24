import { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabaseServer: any;
  let userId: string | null = null;
  try {
    ({ client: supabaseServer, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Missing Bearer token" } });
  }

  let requester: { id: string; role: string | null; company_id: string | null };
  try {
    requester = await requireRequesterProfile(supabaseServer, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { message: err?.message || "Unable to load profile" },
    });
  }

  const isAdmin = isAdminRole(requester.role);
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
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: { message: "Only administrators can create categories" } });
    }
    const { project_id, name, plan_id, point_a_x, point_a_y, point_a_label } = req.body;
    const { data, error } = await supabase.from("cable_categories").insert([{
      project_id, name, plan_id, point_a_x, point_a_y, point_a_label
    }]).select("*").single();
    if (error) return res.status(500).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (method === "DELETE") {
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: { message: "Only administrators can delete categories" } });
    }
    if (!id) return res.status(400).json({ ok: false, error: { message: "Missing id" } });
    const { error } = await supabase.from("cable_categories").delete().eq("id", id);
    if (error) return res.status(500).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true, data: { success: true } });
  }

  return res.status(405).json({ ok: false, error: { message: "Method not allowed" } });
}
