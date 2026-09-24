import { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ ok: false, error: "Not found" });
    }

    let supabaseServer: any;
    let userId: string | null = null;
    try {
        ({ client: supabaseServer, userId } = createServerSupabaseClient(req));
    } catch {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    try {
        const requester = await requireRequesterProfile(supabaseServer, userId);
        if (!isAdminRole(requester.role)) {
            return res.status(403).json({ ok: false, error: "Forbidden: Admins only" });
        }
        const query = `
          ALTER TABLE public.cable_routes
            ADD COLUMN IF NOT EXISTS plan_id_2 uuid references public.plans(id) on delete set null,
            ADD COLUMN IF NOT EXISTS point_c_x numeric(10,8),
            ADD COLUMN IF NOT EXISTS point_c_y numeric(10,8),
            ADD COLUMN IF NOT EXISTS point_d_x numeric(10,8),
            ADD COLUMN IF NOT EXISTS point_d_y numeric(10,8),
            ADD COLUMN IF NOT EXISTS scale numeric(10,8),
            ADD COLUMN IF NOT EXISTS waypoints_2 jsonb DEFAULT '[]'::jsonb;
        `;
        // Since we can't run arbitrary SQL via JS client, we'll use PostgREST RPC if exists.
        // If not, we will just use the REST API to see if it works... wait, we can't run DDL via REST.
        // Let's use the query via a pool if pg is available.
        return res.status(200).json({ error: "Use pg module instead" });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
