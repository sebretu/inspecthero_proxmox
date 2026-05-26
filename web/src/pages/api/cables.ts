import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendApprovalRequest } from "@/lib/telegram";

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function asInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : def;
}

function readJsonBody(req: NextApiRequest): any {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

const VALID_STATUSES = ["pending", "in_progress", "pending_approval", "done"] as const;
type CableStatus = typeof VALID_STATUSES[number];

// Statuses a regular user (non-mod) is allowed to set
const USER_ALLOWED_STATUSES = ["in_progress", "pending_approval"] as const;

function isCableStatus(v: string): v is CableStatus {
  return (VALID_STATUSES as readonly string[]).includes(v);
}

let _adminClient: ReturnType<typeof getSupabaseAdminClient> | null = null;
function getAdminClientSafely() {
  if (_adminClient) return _adminClient;
  try {
    _adminClient = getSupabaseAdminClient();
  } catch {
    _adminClient = null;
  }
  return _adminClient;
}

async function logCableHistory(opts: {
  cable_id: string;
  action: string;
  old_value?: Record<string, any> | null;
  new_value?: Record<string, any> | null;
  user_id: string;
}) {
  const admin = getAdminClientSafely();
  if (!admin) {
    console.warn("[cables api] admin client unavailable, cannot log history");
    return;
  }
  try {
    await admin.from("cable_history").insert({
      cable_id: opts.cable_id,
      action: opts.action,
      old_value: opts.old_value ?? null,
      new_value: opts.new_value ?? null,
      user_id: opts.user_id,
    });
  } catch (err) {
    console.error("[cables api] history log failed:", err);
  }
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
  const isMod = isAdmin || (requester.role || "").toUpperCase() === "MODERATOR";

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/cables
  // Query params: projectId (required), status, q, limit, offset, routeId
  // ────────────────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });
    }

    const limit  = Math.min(Math.max(asInt(req.query.limit,  50), 1), 2000);
    const offset = Math.max(asInt(req.query.offset, 0), 0);
    const q        = typeof req.query.q        === "string" ? req.query.q.trim()        : "";
    const status   = typeof req.query.status   === "string" ? req.query.status.trim()   : "";
    const routeId  = typeof req.query.routeId  === "string" ? req.query.routeId.trim()  : "";

    let query = supabase
      .from("cables")
      .select(`
        *,
        index_number,
        cable_routes ( id, name, point_a_label, point_b_label, plan_id, point_a_x, point_a_y, point_b_x, point_b_y, waypoints, plan_id_2, point_c_x, point_c_y, point_d_x, point_d_y, waypoints_2, scale, scale_2 ),
        trommels ( id, name, index_number, total_length, cable_type, serial_number, company_name ),
        profiles!cables_created_by_fkey ( id, full_name ),
        reported_profile:profiles!cables_reported_by_fkey ( id, full_name )
      `)
      .eq("project_id", projectId)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (status && isCableStatus(status)) query = query.eq("status", status);
    if (routeId && isUuid(routeId))       query = query.eq("route_id", routeId);
    if (q) {
      const qNum = parseInt(q);
      if (!isNaN(qNum) && q.match(/^\d+$/)) {
        // Strict match for index number if query is purely numeric
        query = query.eq("index_number", qNum);
      } else {
        // Search by name only if not a pure number
        query = query.ilike("name", `%${q}%`);
      }
    }

    const { data, error } = await query;

    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message },
      });
    }

    return res.status(200).json({ ok: true, data: data ?? [], meta: { limit, offset } });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // POST /api/cables — create
  // Body: { project_id, name, length?, status?, route_id?, trommel_id? }
  // ────────────────────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const project_id  = String(body?.project_id  || "").trim();
    const name        = String(body?.name         || "").trim();
    const length_raw  = body?.length;
    const length      = length_raw != null && length_raw !== "" ? Number(length_raw) : null;
    const status_raw  = String(body?.status || "pending").trim().toLowerCase();
    const status      = isCableStatus(status_raw) ? status_raw : "pending";
    const route_raw   = typeof body?.route_id   === "string" ? body.route_id.trim()   : "";
    const trommel_raw = typeof body?.trommel_id  === "string" ? body.trommel_id.trim() : "";
    const cable_type  = body?.cable_type != null ? String(body.cable_type).trim() || null : null;
    const category_id = typeof body?.category_id === "string" ? body.category_id.trim() : "";

    if (!project_id) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing project_id" } });
    if (!name)       return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing name (required)" } });
    if (length !== null && !Number.isFinite(length)) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "length must be a number" } });
    }
    if (route_raw   && !isUuid(route_raw))   return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "route_id must be uuid" } });
    if (trommel_raw && !isUuid(trommel_raw)) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "trommel_id must be uuid" } });
    if (category_id && !isUuid(category_id)) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "category_id must be uuid" } });
    if (!userId) return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Cannot determine user from token" } });

    if (trommel_raw && length !== null) {
      const [{ data: trommel }, { data: usedAgg }] = await Promise.all([
        supabase.from("trommels").select("total_length").eq("id", trommel_raw).single(),
        supabase.from("cables").select("length").eq("trommel_id", trommel_raw),
      ]);

      if (trommel?.total_length != null) {
        const usedLength = (usedAgg || []).reduce((s: number, c: any) => s + (c.length || 0), 0);
        if (usedLength + length > trommel.total_length) {
          const remaining = trommel.total_length - usedLength;
          return res.status(422).json({
            ok: false,
            error: {
              code: "TROMMEL_FULL",
              message: `Trommel ma niewystarczającą długość. Dostępne: ${remaining}m, potrzeba: ${length}m`,
            },
          });
        }
      }
    }

    // Find smallest available index_number
    const { data: existingIndices, error: idxError } = await supabase
      .from("cables")
      .select("index_number")
      .eq("project_id", project_id)
      .order("index_number", { ascending: true });
    
    let nextIndex: number | null = 1;
    if (idxError && idxError.message?.includes('column "index_number" does not exist')) {
      nextIndex = null;
    } else if (existingIndices && existingIndices.length > 0) {
      const used = new Set(existingIndices.map((c: any) => c.index_number).filter((n: any) => n != null));
      while (used.has(nextIndex)) {
        nextIndex = (nextIndex || 0) + 1;
      }
    }

    // Fetch project's company_id to ensure the cable belongs to the project's company
    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select("company_id")
      .eq("id", project_id)
      .single();

    if (projErr || !proj) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid project_id" } });
    }

    const payload: Record<string, any> = {
      project_id,
      company_id: proj.company_id,
      name,
      status,
      created_by: userId,
    };
    if (nextIndex !== null) payload.index_number = nextIndex;
    if (length !== null)   payload.length     = length;
    if (route_raw)         payload.route_id   = route_raw;
    if (trommel_raw)       payload.trommel_id = trommel_raw;
    if (cable_type)        payload.cable_type = cable_type;
    if (category_id)       payload.category_id = category_id;

    const { data, error } = await supabase.from("cables").insert(payload).select("*").single();
    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message },
      });
    }

    // Log history
    await logCableHistory({
      cable_id: data.id,
      action: "created",
      new_value: { name: data.name, status: data.status, length: data.length, index_number: data.index_number },
      user_id: userId,
    });

    return res.status(200).json({ ok: true, data });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PATCH /api/cables — update
  // Body: { id, name?, length?, status?, route_id?, trommel_id? }
  // ────────────────────────────────────────────────────────────────────────────
  if (req.method === "PATCH") {
    const body = readJsonBody(req);
    const id = String(body?.id || "").trim();
    if (!id || !isUuid(id)) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid id (uuid)" } });
    }
    if (!userId) return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Cannot determine user from token" } });

    // Fetch current state for history diff
    const { data: prev, error: prevErr } = await supabase
      .from("cables")
      .select("name, length, status, route_id, trommel_id")
      .eq("id", id)
      .single();

    if (prevErr || !prev) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Cable not found" } });
    }

    const patch: Record<string, any> = {};

    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "name cannot be empty" } });
      patch.name = n;
    }
    if (body.length !== undefined) {
      if (body.length === null || body.length === "") {
        patch.length = null;
      } else {
        const l = Number(body.length);
        if (!Number.isFinite(l)) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "length must be a number" } });
        patch.length = l;
      }
    }
    if (body.status !== undefined) {
      const s = String(body.status).trim().toLowerCase();
      if (!isCableStatus(s)) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: `Invalid status: ${s}` } });
      // Only mods/admins can set 'done'; regular users can only set in_progress or pending_approval
      if (s === "done" && !isMod) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins/moderators can mark a cable as done" } });
      }
      if (s === "pending" && !isMod) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins/moderators can reset a cable to pending" } });
      }
      patch.status = s;
      // Track who reported for approval
      if (s === "pending_approval" && userId) {
        patch.reported_by = userId;
      }
    }
    if (body.route_id !== undefined) {
      const r = typeof body.route_id === "string" ? body.route_id.trim() : "";
      if (r && !isUuid(r)) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "route_id must be uuid" } });
      patch.route_id = r || null;
    }
    if (body.trommel_id !== undefined) {
      const t = typeof body.trommel_id === "string" ? body.trommel_id.trim() : "";
      if (t && !isUuid(t)) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "trommel_id must be uuid" } });
      patch.trommel_id = t || null;
    }
    if (body.cable_type !== undefined) {
      patch.cable_type = body.cable_type ? String(body.cable_type).trim() || null : null;
    }
    if (body.category_id !== undefined) {
      const c = typeof body.category_id === "string" ? body.category_id.trim() : "";
      if (c && !isUuid(c)) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "category_id must be uuid" } });
      patch.category_id = c || null;
    }
    if (body.is_verified !== undefined) {
      if (!isMod) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins/mods can verify cables" } });
      patch.is_verified = !!body.is_verified;
    }

    const tId = patch.trommel_id !== undefined ? patch.trommel_id : prev.trommel_id;
    if (tId && (patch.length !== undefined || patch.trommel_id !== undefined)) {
      const [{ data: trommel }, { data: usedAgg }] = await Promise.all([
        supabase.from("trommels").select("total_length").eq("id", tId).single(),
        supabase.from("cables").select("length").eq("trommel_id", tId).neq("id", id),
      ]);

      if (trommel?.total_length != null) {
        const usedLength = (usedAgg || []).reduce((s: number, c: any) => s + (c.length || 0), 0);
        const cableLen = patch.length !== undefined ? patch.length : prev.length;
        if (cableLen !== null && usedLength + cableLen > trommel.total_length) {
          const remaining = trommel.total_length - usedLength;
          return res.status(422).json({
            ok: false,
            error: {
              code: "TROMMEL_FULL",
              message: `Trommel ma niewystarczającą długość. Dostępne: ${remaining}m, potrzeba: ${cableLen}m`,
            },
          });
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "No fields to update" } });
    }

    const { data, error } = await supabase.from("cables").update(patch).eq("id", id).select("*").single();
    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message },
      });
    }

    // Compute diff for history
    const trackedFields = ["name", "length", "status", "route_id", "trommel_id", "is_verified"] as const;
    const oldValue: Record<string, any> = {};
    const newValue: Record<string, any> = {};
    for (const f of trackedFields) {
      if (patch[f] !== undefined && (prev as any)[f] !== patch[f]) {
        oldValue[f] = (prev as any)[f];
        newValue[f] = patch[f];
      }
    }

    const isStatusChange = patch.status !== undefined && prev.status !== patch.status;
    const action = isStatusChange ? "status_changed" : "updated";

    await logCableHistory({
      cable_id: id,
      action,
      old_value: Object.keys(oldValue).length ? oldValue : null,
      new_value: Object.keys(newValue).length ? newValue : null,
      user_id: userId,
    });

    // 🔔 Telegram Notification for Admin
    if (patch.status === "pending_approval") {
      try {
        // Fetch extra info for the notification
        const { data: fullInfo } = await supabase
          .from("cables")
          .select("name, projects(name), profiles!cables_reported_by_fkey(full_name)")
          .eq("id", id)
          .single();

        if (fullInfo) {
          const cableName = fullInfo.name;
          const projectName = fullInfo.projects?.name || "Nieznany projekt";
          const reporterName = fullInfo.profiles?.full_name || "Nieznany użytkownik";
          await sendApprovalRequest(id, cableName, projectName, reporterName);
        }
      } catch (tgErr) {
        console.error("[telegram] notification trigger failed:", tgErr);
      }
    }

    return res.status(200).json({ ok: true, data });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DELETE /api/cables?id=...  (admin/mod only)
  // ────────────────────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    if (!isMod) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins/mods can delete cables" } });
    }
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!id || !isUuid(id)) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid id (uuid)" } });
    }

    // Log deletion before removing
    if (userId) {
      const { data: cable } = await supabase.from("cables").select("name, status").eq("id", id).single();
      if (cable) {
        await logCableHistory({
          cable_id: id,
          action: "deleted",
          old_value: { name: cable.name, status: cable.status },
          user_id: userId,
        });
      }
    }

    const admin = getAdminClientSafely() || supabase;
    const { error } = await admin.from("cables").delete().eq("id", id);

    if (error) {
      return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    }

    return res.status(200).json({ ok: true, data: { id } });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
