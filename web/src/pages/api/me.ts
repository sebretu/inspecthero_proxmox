import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const auth = req.headers.authorization || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return res.status(401).json({ error: "AUTH_INVALID" });
  }

  // The user is authenticated, we can safely fetch their profile with admin rights
  // The user is authenticated, we can safely fetch their profile with admin rights
  const adminClient = getSupabaseAdminClient();
  const { data: profile, error: profileErr } = await adminClient
    .from("profiles")
    .select("id, email, full_name, role, company_id, has_vde_access")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return res.status(403).json({ error: "PROFILE_NOT_FOUND" });
  }

  return res.status(200).json({ ok: true, data: { profile } });
}
