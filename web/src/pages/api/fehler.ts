import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "DONE_WAITING_APPROVAL", "APPROVED", "REJECTED"];

function bad(res: NextApiResponse<ApiOk | ApiErr>, message: string) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message } });
}
function supaErr(res: NextApiResponse<ApiOk | ApiErr>, error: any) {
    console.error("[fehler api] supabase error:", error);
    return res.status(error?.status || 400).json({ ok: false, error: { code: "SUPABASE", message: error?.message || "supabase error" } });
}

async function logHistory(admin: any, fehlerId: string, changedBy: string, action: string, summary: string, meta?: any) {
    await admin.from("fehler_history").insert({
        fehler_id: fehlerId,
        changed_by: changedBy,
        action,
        summary,
        meta: meta ?? null,
    });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
    let supabase: any;
    let userId: string | null = null;
    try {
        ({ client: supabase, userId } = createServerSupabaseClient(req));
    } catch (e: any) {
        console.error("[fehler api] auth failed:", e.message);
        return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
    }

    let requester: { id: string; role: string | null };
    try {
        requester = await requireRequesterProfile(supabase, userId);
    } catch (err: any) {
        return res.status(err?.status || 403).json({ ok: false, error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" } });
    }

    const isAdmin = isAdminRole(requester.role);
    const admin = getSupabaseAdminClient();

    // GET /api/fehler?projectId=...&planId=...
    if (req.method === "GET") {
        const projectId = String(req.query.projectId || "").trim();
        const planId = String(req.query.planId || "").trim();
        const assignedUserId = String(req.query.assignedUserId || "").trim();
        const statusFilter = String(req.query.status || "").trim();
        const limit = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 200);
        const offset = parseInt(String(req.query.offset || "0"), 10) || 0;

        let query = admin
            .from("fehler")
            .select("*, profiles!assigned_user_id(id, full_name), fehler_photos(id, url, photo_type, created_at)")
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (projectId) query = query.eq("project_id", projectId);
        if (planId) query = query.eq("plan_id", planId);
        if (assignedUserId) query = query.eq("assigned_user_id", assignedUserId);
        if (statusFilter) query = query.eq("status", statusFilter);

        const { data, error } = await query;
        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data: data ?? [] });
    }

    // POST /api/fehler
    if (req.method === "POST") {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const title = String(body?.title || "").trim();
        const description = body?.description ? String(body.description).trim() : null;
        const project_id = String(body?.project_id || "").trim();
        const plan_id = body?.plan_id ? String(body.plan_id).trim() : null;
        const x_norm = typeof body?.x_norm === "number" ? body.x_norm : null;
        const y_norm = typeof body?.y_norm === "number" ? body.y_norm : null;
        const assigned_user_id = body?.assigned_user_id ? String(body.assigned_user_id).trim() : null;
        const priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body?.priority) ? body.priority : "MEDIUM";

        if (!title) return bad(res, "Title is required");
        if (!project_id) return bad(res, "project_id is required");

        const { data, error } = await admin
            .from("fehler")
            .insert({ title, description, project_id, plan_id, x_norm, y_norm, assigned_user_id, priority, created_by: requester.id, status: "OPEN" })
            .select("*")
            .single();

        if (error) return supaErr(res, error);

        // Log creation to history
        await logHistory(admin, data.id, requester.id, "CREATED", `Fehler "${title}" created`, { priority, assigned_user_id });

        return res.status(200).json({ ok: true, data });
    }

    // PATCH /api/fehler?id=...
    if (req.method === "PATCH") {
        const id = String(req.query.id || "").trim();
        if (!id) return bad(res, "Missing id");

        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

        // Fetch current state for history comparison
        const { data: current, error: fetchErr } = await admin.from("fehler").select("*").eq("id", id).single();
        if (fetchErr || !current) return bad(res, "Fehler not found");

        const updates: any = {};
        const historyEvents: { action: string; summary: string; meta: any }[] = [];

        if (body?.title !== undefined) {
            const newTitle = String(body.title).trim();
            if (newTitle !== current.title) {
                historyEvents.push({ action: "TITLE_CHANGED", summary: `Title changed from "${current.title}" to "${newTitle}"`, meta: { old: current.title, new: newTitle } });
            }
            updates.title = newTitle;
        }
        if (body?.description !== undefined) {
            if ((body.description || null) !== current.description) {
                historyEvents.push({ action: "DESCRIPTION_CHANGED", summary: "Description updated", meta: { old: current.description, new: body.description || null } });
            }
            updates.description = body.description || null;
        }
        if (body?.assigned_user_id !== undefined) {
            const newAssignee = body.assigned_user_id || null;
            if (newAssignee !== current.assigned_user_id) {
                historyEvents.push({ action: "ASSIGNEE_CHANGED", summary: "Assignee changed", meta: { old: current.assigned_user_id, new: newAssignee } });
            }
            updates.assigned_user_id = newAssignee;
        }
        if (body?.priority !== undefined && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body.priority)) {
            if (body.priority !== current.priority) {
                historyEvents.push({ action: "PRIORITY_CHANGED", summary: `Priority changed from ${current.priority} to ${body.priority}`, meta: { old: current.priority, new: body.priority } });
            }
            updates.priority = body.priority;
        }

        // Status transition
        if (body?.status !== undefined && VALID_STATUSES.includes(body.status)) {
            const newStatus = body.status;
            const oldStatus = current.status;

            if (newStatus !== oldStatus) {
                // Validate transitions
                const allowed = isAdmin || current.assigned_user_id === requester.id || current.created_by === requester.id;

                if (newStatus === "DONE_WAITING_APPROVAL") {
                    // Requires after photo
                    const { count: afterCount } = await admin
                        .from("fehler_photos")
                        .select("id", { count: "exact", head: true })
                        .eq("fehler_id", id)
                        .eq("photo_type", "AFTER");

                    if ((afterCount ?? 0) === 0) {
                        return res.status(400).json({ ok: false, error: { code: "AFTER_PHOTO_REQUIRED", message: "An 'after' photo is required before submitting for approval" } });
                    }
                    if (!allowed) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only assignee or admin can submit for approval" } });
                    updates.done_reported_by = requester.id;
                    updates.done_reported_at = new Date().toISOString();
                } else if (newStatus === "APPROVED") {
                    if (!isAdmin) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admin can approve" } });
                    updates.approved_by = requester.id;
                    updates.approved_at = new Date().toISOString();
                } else if (newStatus === "REJECTED") {
                    if (!isAdmin) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admin can reject" } });
                    const rejection_reason = body?.rejection_reason ? String(body.rejection_reason).trim() : null;
                    if (!rejection_reason) return bad(res, "Rejection reason required");
                    updates.rejected_by = requester.id;
                    updates.rejected_at = new Date().toISOString();
                    updates.rejection_reason = rejection_reason;
                } else if (!allowed) {
                    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Not authorized to change status" } });
                }

                updates.status = newStatus;
                historyEvents.push({ action: "STATUS_CHANGED", summary: `Status changed from ${oldStatus} to ${newStatus}`, meta: { old: oldStatus, new: newStatus } });
            }
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await admin.from("fehler").update(updates).eq("id", id).select("*").single();
        if (error) return supaErr(res, error);

        // Write all history events
        for (const ev of historyEvents) {
            await logHistory(admin, id, requester.id, ev.action, ev.summary, ev.meta);
        }

        return res.status(200).json({ ok: true, data });
    }

    // DELETE /api/fehler?id=...
    if (req.method === "DELETE") {
        if (!isAdmin) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins can delete fehler" } });
        const id = String(req.query.id || "").trim();
        if (!id) return bad(res, "Missing id");

        const { data: photos } = await admin.from("fehler_photos").select("storage_path").eq("fehler_id", id);
        if (photos && photos.length > 0) {
            const paths = photos.filter((p: any) => p.storage_path).map((p: any) => p.storage_path as string);
            if (paths.length > 0) await admin.storage.from("fehler-photos").remove(paths);
        }

        const { error } = await admin.from("fehler").delete().eq("id", id);
        if (error) return supaErr(res, error);
        return res.status(200).json({ ok: true, data: { deleted: true } });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
