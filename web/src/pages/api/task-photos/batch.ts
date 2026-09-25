import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/task-photos/batch
 *
 * Query params:
 *   taskIds  – one or more task UUIDs  (repeated: taskIds=a&taskIds=b)
 *   phases   – one or more of BEFORE | AFTER (optional, default = all)
 *   limit    – max photos per task per phase (optional, default = 1)
 *
 * Response: flat array of task_photos rows, e.g.
 *   [{ id, task_id, photo_type, url, thumb_url, ... }, ...]
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
    }

    // Auth
    let supabase: any;
    let userId: string | null = null;
    try {
        ({ client: supabase, userId } = createServerSupabaseClient(req));
    } catch {
        return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
    }

    try {
        await requireRequesterProfile(supabase, userId);
    } catch (err: any) {
        return res.status(err?.status || 403).json({ ok: false, error: { code: "FORBIDDEN", message: err?.message || "Forbidden" } });
    }

    // Parse taskIds
    const rawIds = req.query.taskIds;
    const taskIds: string[] = Array.isArray(rawIds)
        ? rawIds.map(String).filter(Boolean)
        : rawIds
            ? [String(rawIds)]
            : [];

    if (taskIds.length === 0) {
        return res.status(200).json({ ok: true, data: [] });
    }

    // Parse phases
    const rawPhases = req.query.phases;
    const allPhases = Array.isArray(rawPhases)
        ? rawPhases.map((p) => String(p).toUpperCase())
        : rawPhases
            ? [String(rawPhases).toUpperCase()]
            : [];
    const phases = allPhases.filter((p) => p === "BEFORE" || p === "AFTER");

    // Parse limit (per task per phase)
    const limitRaw = Number(req.query.limit);
    const limitPerPhase = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 50) : 1;

    const admin = getSupabaseAdminClient();

    // Fetch photos for all taskIds in one DB query
    let q = admin
        .from("task_photos")
        .select("*")
        .in("task_id", taskIds)
        .order("created_at", { ascending: false });

    if (phases.length > 0) {
        q = q.in("photo_type", phases);
    }

    const { data: allPhotos, error } = await q;

    if (error) {
        console.error("[batch] Supabase error", error);
        return res.status(500).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    }

    // Keep only `limitPerPhase` photos per task per phase
    const seen: Record<string, number> = {};
    const result: any[] = [];

    for (const photo of allPhotos ?? []) {
        const key = `${photo.task_id}::${photo.photo_type}`;
        seen[key] = (seen[key] ?? 0) + 1;
        if (seen[key] <= limitPerPhase) {
            result.push(photo);
        }
    }

    return res.status(200).json({ ok: true, data: result });
}
