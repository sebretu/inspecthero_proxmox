import type { NextApiRequest, NextApiResponse } from "next";
import { createServiceSupabaseClient } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const supabase = createServiceSupabaseClient();
        const { data, error } = await supabase.from("profiles").select("email, role");
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
    } catch (e: any) {
        return res.status(500).json({ ok: false, error: e.message });
    }
}
