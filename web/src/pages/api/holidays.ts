import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
    }

    let supabase: any;
    try {
        ({ client: supabase } = createServerSupabaseClient(req));
    } catch (e: any) {
        return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
    }

    const region = (req.query.region as string) || "NRW";
    const year = req.query.year as string;

    let query = supabase
        .from("public_holidays")
        .select("id, date, name, region")
        .eq("region", region);

    if (year) {
        query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
    }

    const { data, error } = await query.order("date", { ascending: true });

    if (error) {
        return res.status(400).json({
            ok: false,
            error: {
                code: "SUPABASE",
                message: error.message,
                meta: { code: error.code, details: error.details },
            },
        });
    }

    return res.status(200).json({ ok: true, data: data ?? [] });
}
