import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function asInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : def;
}

function readJsonBody(req: NextApiRequest): any {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
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

  // ------------------------
  // GET /api/chargers
  // ------------------------
  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });
      return;
    }

    const planId = typeof req.query.planId === "string" ? req.query.planId.trim() : "";
    const limit = Math.min(Math.max(asInt(req.query.limit, 50) || 50, 1), 1000);
    const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);

    let query = supabase
      .from("chargers")
      .select("*, profiles!created_by(full_name, email)")
      .eq("project_id", projectId)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (planId) query = query.eq("plan_id", planId);

    const { data, error } = await query;

    if (error) {
      res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message },
      });
      return;
    }

    res.status(200).json({ ok: true, data: data ?? [], meta: { limit, offset, planId: planId || null } });
    return;
  }

  // ------------------------
  // POST /api/chargers
  // ------------------------
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const project_id = String(body?.project_id || "").trim();
    const plan_id = String(body?.plan_id || "").trim();
    const mac = String(body?.mac || "").trim();
    const pin = String(body?.pin || "").trim();
    const qr_text = String(body?.qr_text || "").trim();
    const photo_url = body?.photo_url ? String(body.photo_url).trim() : null;

    const x_norm_raw = body?.x_norm;
    const y_norm_raw = body?.y_norm;
    const x_norm = typeof x_norm_raw === "number" ? x_norm_raw : Number(x_norm_raw);
    const y_norm = typeof y_norm_raw === "number" ? y_norm_raw : Number(y_norm_raw);

    if (!project_id || !plan_id) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing project_id or plan_id" } });
      return;
    }
    if (!mac) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing mac" } });
      return;
    }

    const payload: any = {
      project_id,
      plan_id,
      x_norm,
      y_norm,
      mac,
      pin,
      qr_text,
      photo_url,
      created_by: userId,
    };

    const { data, error } = await supabase.from("chargers").insert(payload).select("*").single();

    if (error) {
      res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message },
      });
      return;
    }

    res.status(200).json({ ok: true, data });
    return;
  }

  // PATCH /api/chargers (update photo_url etc)
  if (req.method === "PATCH") {
    const body = readJsonBody(req);
    const id = String(body?.id || "").trim();
    if (!id || !isUuid(id)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid id (uuid)" } });
      return;
    }

    const patch: any = {};
    if (body.photo_url !== undefined) patch.photo_url = body.photo_url ? String(body.photo_url).trim() : null;
    if (body.mac !== undefined) patch.mac = String(body.mac).trim();
    if (body.pin !== undefined) patch.pin = String(body.pin).trim();
    if (body.qr_text !== undefined) patch.qr_text = String(body.qr_text).trim();
    if (body.x_norm !== undefined) patch.x_norm = Number(body.x_norm);
    if (body.y_norm !== undefined) patch.y_norm = Number(body.y_norm);
    if (body.project_id !== undefined) patch.project_id = String(body.project_id).trim();
    if (body.plan_id !== undefined) patch.plan_id = String(body.plan_id).trim();

    const { data, error } = await supabase.from("chargers").update(patch).eq("id", id).select("*").single();

    if (error) {
       res.status((error as any).status || 400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
       return;
    }

    res.status(200).json({ ok: true, data });
    return;
  }

  // DELETE /api/chargers
  if (req.method === "DELETE") {
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!id || !isUuid(id)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid id (uuid)" } });
      return;
    }

    // Only admins or creator can delete
    const { data: charger } = await supabase.from("chargers").select("created_by, project_id").eq("id", id).single();
    if (!charger) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Charger not found" } });
    }
    
    if (!isAdmin && charger.created_by !== userId) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins or creator can delete" } });
    }

    const { error } = await supabase.from("chargers").delete().eq("id", id);
    if (error) {
      res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
      return;
    }

    res.status(200).json({ ok: true, data: { deleted: id } });
    return;
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
