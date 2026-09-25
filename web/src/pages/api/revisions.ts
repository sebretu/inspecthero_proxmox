import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const config = {
    api: {
        bodyParser: {
            sizeLimit: "1mb",
        },
    },
};

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

function bad(res: NextApiResponse<ApiOk | ApiErr>, message: string) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message } });
}

function supaErr(res: NextApiResponse<ApiOk | ApiErr>, error: any) {
    return res.status(error?.status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error?.message || "supabase error" },
    });
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
        return res.status(err?.status || 403).json({
            ok: false,
            error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
        });
    }

    const isAdmin = isAdminRole(requester.role);
    const admin = getSupabaseAdminClient();

    // GET /api/revisions?projectId=...
    if (req.method === "GET") {
        if (!isAdmin) {
            return res.status(200).json({ ok: true, data: [] });
        }

        const projectId = String(req.query.projectId || "").trim();
        const planId = String(req.query.planId || "").trim();
        const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 200);
        const offset = parseInt(String(req.query.offset || "0"), 10) || 0;

        let query = admin
            .from("revisions")
            .select("*, profiles!assigned_user_id(id, full_name), revision_photos(id, url, created_at)")
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (projectId) query = query.eq("project_id", projectId);
        if (planId) query = query.eq("plan_id", planId);

        const { data, error } = await query;
        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data: data ?? [] });
    }
    // POST /api/revisions
    if (req.method === "POST") {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const title = String(body?.title || "").trim();
        const description = body?.description ? String(body.description).trim() : null;
        const project_id = String(body?.project_id || "").trim();
        const plan_id = body?.plan_id ? String(body.plan_id).trim() : null;
        const x_norm = typeof body?.x_norm === "number" ? body.x_norm : null;
        const y_norm = typeof body?.y_norm === "number" ? body.y_norm : null;
        const assigned_user_id = body?.assigned_user_id ? String(body.assigned_user_id).trim() : null;

        if (!title) return bad(res, "Title is required");
        if (!project_id) return bad(res, "project_id is required");

        const { data, error } = await admin
            .from("revisions")
            .insert({ title, description, project_id, plan_id, x_norm, y_norm, assigned_user_id, created_by: requester.id })
            .select("*")
            .single();

        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data });
    }

    // PATCH /api/revisions?id=...
    if (req.method === "PATCH") {
        const id = String(req.query.id || "").trim();
        if (!id) return bad(res, "Missing id");

        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const updates: any = {};
        if (body?.title !== undefined) updates.title = String(body.title).trim();
        if (body?.description !== undefined) updates.description = body.description || null;
        if (body?.assigned_user_id !== undefined) updates.assigned_user_id = body.assigned_user_id || null;
        updates.updated_at = new Date().toISOString();

        const { data, error } = await admin.from("revisions").update(updates).eq("id", id).select("*").single();
        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data });
    }

    // DELETE /api/revisions?id=...
    if (req.method === "DELETE") {
        if (!isAdmin) {
            return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins can delete revisions" } });
        }

        const id = String(req.query.id || "").trim();
        if (!id) return bad(res, "Missing id");

        // Get photos to delete from storage
        const { data: photos } = await admin
            .from("revision_photos")
            .select("storage_path")
            .eq("revision_id", id);

        if (photos && photos.length > 0) {
            const paths = photos.filter((p) => p.storage_path).map((p) => p.storage_path as string);
            if (paths.length > 0) {
                await admin.storage.from("revision-photos").remove(paths);
            }
        }

        const { error } = await admin.from("revisions").delete().eq("id", id);
        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data: { deleted: true } });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
