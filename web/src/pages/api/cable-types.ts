import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type ApiOk = { ok: true; data: string[] };
type ApiErr = { ok: false; error: { code: string; message: string } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiOk | ApiErr | any>
) {
  let supabase, userId;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing token" } });
  }

  try {
    const requester = await requireRequesterProfile(supabase, userId);
    const admin = getSupabaseAdminClient();
    
    if (req.method === "POST") {
      const { project_id, name } = req.body;
      if (!name || !project_id) return res.status(400).json({ ok: false, error: { code: "INVALID_BODY", message: "Missing name or project_id" } });
      const { error } = await admin.from("cable_categories").insert([{ project_id, name }]);
      if (error) return res.status(500).json({ ok: false, error: { code: "DB_ERROR", message: error.message } });
      return res.status(200).json({ ok: true });
    }

    if (req.method === "GET") {
      const projectId = req.query.projectId as string;
      // Fetch cables and trommels globally (all companies), but cable_categories only for the current company to avoid other companies' garbage
      const [cablesRes, trommelsRes, companyCatsRes, projectCatsRes] = await Promise.all([
        admin.from("cables").select("cable_type"),
        admin.from("trommels").select("cable_type"),
        admin.from("cable_categories").select("name, projects!inner(company_id)").eq("projects.company_id", requester.company_id),
        projectId ? admin.from("cable_categories").select("name").eq("project_id", projectId) : Promise.resolve({ data: [] })
      ]);
      
      const types = new Set<string>();
      (cablesRes.data || []).forEach((c: any) => c.cable_type && types.add(c.cable_type));
      (trommelsRes.data || []).forEach((t: any) => t.cable_type && types.add(t.cable_type));
      (companyCatsRes.data || []).forEach((c: any) => c.name && types.add(c.name));
      (projectCatsRes.data || []).forEach((c: any) => c.name && types.add(c.name));
      
      return res.status(200).json({ ok: true, data: Array.from(types).sort() });
    }

    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
}
