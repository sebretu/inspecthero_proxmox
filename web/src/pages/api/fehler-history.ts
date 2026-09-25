import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

function bad(res: NextApiResponse<ApiOk | ApiErr>, message: string) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message } });
}
function supaErr(res: NextApiResponse<ApiOk | ApiErr>, error: any) {
    return res.status(error?.status || 400).json({ ok: false, error: { code: "SUPABASE", message: error?.message || "supabase error" } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
    let supabase: any;
    let userId: string | null = null;
    try {
        ({ client: supabase, userId } = createServerSupabaseClient(req));
    } catch {
        return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
    }

    let requester: { id: string; role: string | null };
    try {
        requester = await requireRequesterProfile(supabase, userId);
    } catch (err: any) {
        return res.status(err?.status || 403).json({ ok: false, error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" } });
    }

    const admin = getSupabaseAdminClient();

    // GET /api/fehler-history?fehlerId=...
    if (req.method === "GET") {
        const fehlerId = String(req.query.fehlerId || "").trim();
        if (!fehlerId) return bad(res, "Missing fehlerId");
        const { data, error } = await admin
            .from("fehler_history")
            .select("*, changer:profiles!changed_by(id, full_name)")
            .eq("fehler_id", fehlerId)
            .order("created_at", { ascending: false });
        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data: data ?? [] });
    }

    // POST /api/fehler-history  - write a manual history note
    if (req.method === "POST") {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const fehler_id = String(body?.fehler_id || "").trim();
        const action = String(body?.action || "NOTE").trim();
        const summary = body?.summary ? String(body.summary).trim() : null;
        const meta = body?.meta ?? null;

        if (!fehler_id) return bad(res, "Missing fehler_id");

        const { data, error } = await admin
            .from("fehler_history")
            .insert({ fehler_id, changed_by: requester.id, action, summary, meta })
            .select("*")
            .single();
        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST" } });
}
