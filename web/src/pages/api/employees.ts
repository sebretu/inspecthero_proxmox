import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
    let supabase: any;
    let userId: string | null = null;
    try {
        const clientObj = createServerSupabaseClient(req);
        supabase = clientObj.client;
        userId = clientObj.userId;
    } catch (e: any) {
        return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
    }

    const { data: me, error: meError } = await supabase
        .from("profiles")
        .select("id, role, company_id")
        .eq("id", userId)
        .single();

    if (meError || !me) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Unauthorized" } });
    }

    const isMod = me.role === 'ADMIN' || me.role === 'MODERATOR' || me.role === 'MOD';
    const isAdmin = me.role === 'ADMIN';

    // Determine which client to use for DB operations. 
    // We use service client to bypass RLS for authorized MODs, as RLS is currently ADMIN-only.
    const db = (isMod || isAdmin) ? createServiceSupabaseClient() : supabase;

    if (req.method === "GET") {
        const { data, error } = await db
            .from("employees")
            .select("*")
            .eq("company_id", me.company_id)
            .order("full_name", { ascending: true });

        if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
        return res.status(200).json({ ok: true, data: data ?? [] });
    }

    if (req.method === "POST") {
        if (!isMod) {
            return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
        }

        const { full_name } = req.body;
        if (!full_name) {
            return res.status(400).json({ ok: false, error: { code: "MISSING_FIELDS", message: "full_name is required" } });
        }

        console.log(`[employees api] adding employee ${full_name} for company ${me.company_id} by ${me.role} (via service client)`);
        const { data, error } = await db
            .from("employees")
            .insert([{ full_name, company_id: me.company_id }])
            .select()
            .single();

        if (error) {
            console.error(`[employees api] insert error:`, error);
            return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
        }
        console.log(`[employees api] success: created id ${data.id}`);
        return res.status(201).json({ ok: true, data });
    }

    if (req.method === "PATCH") {
        if (!isMod) {
            return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
        }

        const { id, full_name, is_active } = req.body;
        if (!id) return res.status(400).json({ ok: false, error: { code: "MISSING_ID", message: "id is required" } });

        const { data, error } = await db
            .from("employees")
            .update({ full_name, is_active })
            .eq("id", id)
            .eq("company_id", me.company_id)
            .select()
            .single();

        if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
        return res.status(200).json({ ok: true, data });
    }

    if (req.method === "DELETE") {
        if (!isAdmin && !isMod) {
            return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only Admins and Moderators can delete employees" } });
        }

        const { id } = req.query;
        if (!id) return res.status(400).json({ ok: false, error: { code: "MISSING_ID", message: "id is required" } });

        const { error } = await db
            .from("employees")
            .delete()
            .eq("id", id)
            .eq("company_id", me.company_id);

        if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
        return res.status(200).json({ ok: true, data: { success: true } });
    }

    res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
}
