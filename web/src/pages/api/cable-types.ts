import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: string[] };
type ApiErr = { ok: false; error: { code: string; message: string } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiOk | ApiErr>
) {
  let supabase, userId;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing token" } });
  }

  try {
    const requester = await requireRequesterProfile(supabase, userId);
    
    // Fetch types from cables and trommels for the same company to have a global list of available types
    const [cablesRes, trommelsRes] = await Promise.all([
      supabase.from("cables").select("cable_type").eq("company_id", requester.company_id),
      supabase.from("trommels").select("cable_type").eq("company_id", requester.company_id)
    ]);
    
    const types = new Set<string>();
    (cablesRes.data || []).forEach((c: any) => c.cable_type && types.add(c.cable_type));
    (trommelsRes.data || []).forEach((t: any) => t.cable_type && types.add(t.cable_type));
    
    return res.status(200).json({ ok: true, data: Array.from(types).sort() });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
}
