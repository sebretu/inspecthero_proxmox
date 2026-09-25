import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return res.status(401).json({ error: "AUTH_INVALID" });
  }

  const planId = req.query.id as string;
  if (!planId) {
    return res.status(400).json({ error: "Missing planId" });
  }

  const adminClient = getSupabaseAdminClient();

  try {
    const { data, error } = await adminClient.rpc('enable_plan_versioning', {
      p_plan_id: planId,
      p_user_id: user.id
    });

    if (error) {
      console.error("[enable-versioning] RPC error:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ ok: true, data });
  } catch (err: any) {
    console.error("[enable-versioning] Internal error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
