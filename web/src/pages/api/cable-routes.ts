import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

function readJsonBody(req: NextApiRequest): any {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiOk | ApiErr>
) {
  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  let requester: { id: string; role: string | null; company_id: string | null };
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const isAdmin = isAdminRole(requester.role);
  const isMod = isAdmin;

  // GET /api/cable-routes?projectId=...
  if (req.method === "GET") {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";

    let query = supabase
      .from("cable_routes")
      .select("*")
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) {
      return res.status((error as any).status || 400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    }
    return res.status(200).json({ ok: true, data: data ?? [] });
  }

  // POST /api/cable-routes (admin only)
  if (req.method === "POST") {
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only administrators can create cable routes" } });
    }
    const body = readJsonBody(req);
    const point_a_label = String(body?.point_a_label || "").trim();
    const point_b_label = String(body?.point_b_label || "").trim();
    const name          = String(body?.name || "").trim() || null;
    const project_id    = String(body?.project_id || "").trim() || null;
    const plan_id       = String(body?.plan_id || "").trim() || null;
    const point_a_x     = body?.point_a_x != null ? Number(body.point_a_x) : null;
    const point_a_y     = body?.point_a_y != null ? Number(body.point_a_y) : null;
    const point_b_x     = body?.point_b_x != null ? Number(body.point_b_x) : null;
    const point_b_y     = body?.point_b_y != null ? Number(body.point_b_y) : null;
    const waypoints     = Array.isArray(body?.waypoints) ? body.waypoints : null;
    const plan_id_2     = String(body?.plan_id_2 || "").trim() || null;
    const point_c_x     = body?.point_c_x != null ? Number(body.point_c_x) : null;
    const point_c_y     = body?.point_c_y != null ? Number(body.point_c_y) : null;
    const point_d_x     = body?.point_d_x != null ? Number(body.point_d_x) : null;
    const point_d_y     = body?.point_d_y != null ? Number(body.point_d_y) : null;
    const waypoints_2   = Array.isArray(body?.waypoints_2) ? body.waypoints_2 : null;
    const scale         = body?.scale != null ? Number(body.scale) : null;
    const scale_2       = body?.scale_2 != null ? Number(body.scale_2) : null;
    const point_a_photo = body?.point_a_photo != null ? String(body.point_a_photo).trim() || null : null;
    const point_b_photo = body?.point_b_photo != null ? String(body.point_b_photo).trim() || null : null;

    if (!point_a_label || !point_b_label) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "point_a_label and point_b_label are required" } });
    }

    let targetCompanyId = requester.company_id;
    if (project_id) {
      const { data: proj } = await supabase
        .from("projects")
        .select("company_id")
        .eq("id", project_id)
        .single();
      if (proj?.company_id) {
        targetCompanyId = proj.company_id;
      }
    }

    const payload: Record<string, any> = {
      company_id: targetCompanyId,
      point_a_label,
      point_b_label,
    };
    if (name)       payload.name       = name;
    if (project_id) payload.project_id = project_id;
    if (plan_id)    payload.plan_id    = plan_id;
    if (point_a_x !== null && Number.isFinite(point_a_x)) payload.point_a_x = point_a_x;
    if (point_a_y !== null && Number.isFinite(point_a_y)) payload.point_a_y = point_a_y;
    if (point_b_x !== null && Number.isFinite(point_b_x)) payload.point_b_x = point_b_x;
    if (point_a_photo) payload.point_a_photo = point_a_photo;
    if (point_b_photo) payload.point_b_photo = point_b_photo;
    if (point_b_y !== null && Number.isFinite(point_b_y)) payload.point_b_y = point_b_y;
    if (waypoints !== null) payload.waypoints = waypoints;

    if (plan_id_2)    payload.plan_id_2    = plan_id_2;
    if (point_c_x !== null && Number.isFinite(point_c_x)) payload.point_c_x = point_c_x;
    if (point_c_y !== null && Number.isFinite(point_c_y)) payload.point_c_y = point_c_y;
    if (point_d_x !== null && Number.isFinite(point_d_x)) payload.point_d_x = point_d_x;
    if (point_d_y !== null && Number.isFinite(point_d_y)) payload.point_d_y = point_d_y;
    if (waypoints_2 !== null) payload.waypoints_2 = waypoints_2;
    if (scale !== null && Number.isFinite(scale)) payload.scale = scale;
    if (scale_2 !== null && Number.isFinite(scale_2)) payload.scale_2 = scale_2;

    const { data, error } = await supabase.from("cable_routes").insert(payload).select("*").single();
    if (error) {
      return res.status((error as any).status || 400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    }
    return res.status(200).json({ ok: true, data });
  }

  // DELETE /api/cable-routes?id=... (admin only)
  if (req.method === "DELETE") {
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only administrators can delete routes" } });
    }
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!id) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing id" } });
    }
    const { error } = await supabase.from("cable_routes").delete().eq("id", id);
    if (error) {
      return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    }
    return res.status(200).json({ ok: true, data: { deleted: id } });
  }

  // PATCH /api/cable-routes (admin only)
  if (req.method === "PATCH") {
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only administrators can edit routes" } });
    }
    const body = readJsonBody(req);
    const id = String(body?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing id" } });

    const patch: Record<string, any> = {};
    if (body.name !== undefined)          patch.name          = String(body.name || "").trim() || null;
    if (body.point_a_label !== undefined) { const v = String(body.point_a_label || "").trim(); if (v) patch.point_a_label = v; }
    if (body.point_b_label !== undefined) { const v = String(body.point_b_label || "").trim(); if (v) patch.point_b_label = v; }
    if (body.plan_id !== undefined)       patch.plan_id = String(body.plan_id || "").trim() || null;
    if (body.point_a_x !== undefined)     patch.point_a_x = body.point_a_x != null ? Number(body.point_a_x) : null;
    if (body.point_a_y !== undefined)     patch.point_a_y = body.point_a_y != null ? Number(body.point_a_y) : null;
    if (body.point_b_x !== undefined)     patch.point_b_x = body.point_b_x != null ? Number(body.point_b_x) : null;
    if (body.point_b_y !== undefined)     patch.point_b_y = body.point_b_y != null ? Number(body.point_b_y) : null;
    if (body.point_a_photo !== undefined) patch.point_a_photo = body.point_a_photo === null || String(body.point_a_photo).trim() === "" ? null : String(body.point_a_photo).trim();
    if (body.point_b_photo !== undefined) patch.point_b_photo = body.point_b_photo === null || String(body.point_b_photo).trim() === "" ? null : String(body.point_b_photo).trim();
    if (body.waypoints !== undefined)     patch.waypoints = Array.isArray(body.waypoints) ? body.waypoints : null;
    
    if (body.plan_id_2 !== undefined)      patch.plan_id_2 = String(body.plan_id_2 || "").trim() || null;
    if (body.point_c_x !== undefined)      patch.point_c_x = body.point_c_x != null ? Number(body.point_c_x) : null;
    if (body.point_c_y !== undefined)      patch.point_c_y = body.point_c_y != null ? Number(body.point_c_y) : null;
    if (body.point_d_x !== undefined)      patch.point_d_x = body.point_d_x != null ? Number(body.point_d_x) : null;
    if (body.point_d_y !== undefined)      patch.point_d_y = body.point_d_y != null ? Number(body.point_d_y) : null;
    if (body.waypoints_2 !== undefined)    patch.waypoints_2 = Array.isArray(body.waypoints_2) ? body.waypoints_2 : null;
    if (body.scale !== undefined)          patch.scale = body.scale != null ? Number(body.scale) : null;
    if (body.scale_2 !== undefined)        patch.scale_2 = body.scale_2 != null ? Number(body.scale_2) : null;

    if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "No fields to update" } });

    const { data, error } = await supabase.from("cable_routes").update(patch).eq("id", id).select("*").single();
    if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
