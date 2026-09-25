import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

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

    if (req.method === "GET") {
        const fehlerId = String(req.query.fehlerId || "").trim();
        if (!fehlerId) return bad(res, "Missing fehlerId");
        const { data, error } = await admin
            .from("fehler_photos")
            .select("*, profiles!uploaded_by(role)")
            .eq("fehler_id", fehlerId)
            .order("created_at", { ascending: true });
        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data: data ?? [] });
    }

    if (req.method === "POST") {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const fehler_id = String(body?.fehler_id || "").trim();
        const file_name = String(body?.file_name || "photo.jpg").trim();
        const base64 = String(body?.base64 || "").trim();

        if (!fehler_id) return bad(res, "Missing fehler_id");
        if (!base64) return bad(res, "Missing base64");

        const { count: photoCount } = await admin.from("fehler_photos").select("id", { count: "exact", head: true }).eq("fehler_id", fehler_id);
        if ((photoCount ?? 0) >= 10) return res.status(400).json({ ok: false, error: { code: "LIMIT_EXCEEDED", message: "Maximum 10 photos per fehler" } });

        const b64 = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
        let buf: Buffer;
        try { buf = Buffer.from(b64, "base64"); } catch { return bad(res, "Invalid base64"); }

        const safeName = file_name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const rand = Math.random().toString(16).slice(2, 10);
        const storage_path = `${fehler_id}/${stamp}-${rand}-${safeName}`;

        const ext = safeName.toLowerCase().split(".").pop() || "";
        const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : (ext === "heic" || ext === "heif") ? "image/heic" : "image/jpeg";

        const bucket = "fehler-photos";
        const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
        const publicUrl = PUBLIC_SUPABASE_URL ? `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storage_path}` : null;
        if (!publicUrl) return bad(res, "Failed to create public URL");

        const uploadResult = await admin.storage.from(bucket).upload(storage_path, buf, { upsert: false, contentType, cacheControl: "3600" });
        if (uploadResult.error) return supaErr(res, uploadResult.error);

        const photo_type = ["BEFORE", "AFTER"].includes(body?.photo_type) ? body.photo_type : "BEFORE";
        const { data: inserted, error: insertErr } = await admin.from("fehler_photos").insert({ fehler_id, uploaded_by: requester.id, url: publicUrl, storage_path, photo_type }).select("*").single();
        if (insertErr) return supaErr(res, insertErr);
        return res.status(200).json({ ok: true, data: inserted });
    }

    if (req.method === "DELETE") {
        const id = String(req.query.id || "").trim();
        if (!id) return bad(res, "Missing id");
        const { data: photo } = await admin.from("fehler_photos").select("*").eq("id", id).single();
        if (!photo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Photo not found" } });

        // Check uploader role
        const { data: uploaderProfile } = await admin.from("profiles").select("role").eq("id", photo.uploaded_by).single();
        const isAdmin = (requester.role || "").toUpperCase() === "ADMIN";
        const isPhotoByAdmin = uploaderProfile?.role === "ADMIN";

        if (!isAdmin && isPhotoByAdmin) {
            return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Photos added by administrators cannot be deleted by users or moderators." } });
        }

        if (photo.storage_path) await admin.storage.from("fehler-photos").remove([photo.storage_path]);
        const { error } = await admin.from("fehler_photos").delete().eq("id", id);
        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data: { deleted: true } });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST or DELETE" } });
}
