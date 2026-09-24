import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";
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

        const supabase = createServiceSupabaseClient();
        const { data, error } = await supabase.from("profiles").select("email, role");
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
    } catch (e: any) {
        return res.status(500).json({ ok: false, error: e.message });
    }
}
