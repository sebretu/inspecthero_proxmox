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
    return res.status(401).json({ ok: false, error: "Missing Bearer token" });
  }

  try {
    const requester = await requireRequesterProfile(supabaseServer, userId);
    if (!isAdminRole(requester.role)) {
      return res.status(403).json({ ok: false, error: "Forbidden: Admins only" });
    }

    const adminClient = getSupabaseAdminClient();
    const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers();
    
    if (usersError) throw usersError;
    
    let synced = 0;
    for (const u of usersData.users) {
      // Upsert profile
      const { error } = await adminClient.from("profiles").upsert(
        {
          id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || u.email,
          role: u.user_metadata?.role || "USER",
          is_active: true,
        },
        { onConflict: "id" }
      );
      if (!error) synced++;
    }
    
    return res.status(200).json({ ok: true, synced, total: usersData.users.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
