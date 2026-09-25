import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const config = {
    api: {
        bodyParser: {
            sizeLimit: "10mb",
        },
    },
};

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
    }

    let supabase: any;
    let userId: string | null = null;
    try {
        const clientObj = createServerSupabaseClient(req);
        supabase = clientObj.client;
        userId = clientObj.userId;
    } catch (e: any) {
        return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
    }

    // Role check: Only Admin or Moderator
    const { data: me } = await supabase.from("profiles").select("role").eq("id", userId).single();
    const isMod = me?.role === 'ADMIN' || me?.role === 'MODERATOR' || me?.role === 'MOD';
    if (!isMod) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
    }

    const { employee_id, profile_id, base64, file_name } = req.body;

    if ((!employee_id && !profile_id) || !base64) {
        return res.status(400).json({ ok: false, error: { code: "MISSING_FIELDS", message: "employee_id or profile_id, and base64 are required" } });
    }

    const b64 = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
    const buf = Buffer.from(b64, "base64");

    const bucket = "employee-photos";
    const safeName = (file_name || "photo.jpg").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = employee_id || profile_id;
    const storage_path = `${id}/${stamp}-${safeName}`;

    const adminClient = getSupabaseAdminClient();

    // 1. Upload to Storage
    const { error: uploadErr } = await adminClient.storage.from(bucket).upload(storage_path, buf, {
        upsert: true,
        contentType: "image/jpeg",
    });

    if (uploadErr) {
        return res.status(400).json({ ok: false, error: { code: "UPLOAD_ERROR", message: uploadErr.message } });
    }

    // 2. Get Public URL
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storage_path}`;

    // 3. Update DB
    if (employee_id) {
        await adminClient.from("employees").update({ photo_url: publicUrl }).eq("id", employee_id);
    } else if (profile_id) {
        await adminClient.from("profiles").update({ photo_url: publicUrl }).eq("id", profile_id);
    }

    return res.status(200).json({ ok: true, data: { url: publicUrl } });
}
