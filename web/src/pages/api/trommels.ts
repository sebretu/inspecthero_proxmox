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

  const isMod = isAdminRole(requester.role) || (requester.role || "").toUpperCase() === "MODERATOR";

  // ── GET /api/trommels?projectId=... ─────────────────────────────────────────
  if (req.method === "GET") {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";

    let query = supabase
      .from("trommels")
      .select(`
        *,
        cables ( 
          id, length, name, status, cable_type, index_number,
          cable_routes ( 
            id, name, point_a_label, point_b_label, plan_id, point_a_x, point_a_y, point_b_x, point_b_y, waypoints,
            plan_id_2, point_c_x, point_c_y, point_d_x, point_d_y, waypoints_2
          ),
          reported_profile:profiles!cables_reported_by_fkey ( id, full_name )
        )
      `)
      .order("name", { ascending: true });

    if (projectId) {
      query = query.or(`project_id.eq.${projectId},project_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      return res.status((error as any).status || 400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    }

    // compute remaining_length for each trommel
    const enriched = (data ?? []).map((tr: any) => {
      const usedLength = (tr.cables || []).reduce((sum: number, c: any) => {
        return sum + (typeof c.length === "number" ? c.length : 0);
      }, 0);
      const baseLength = (tr.remnant_length != null && tr.remnant_length > 0) ? tr.remnant_length : (tr.total_length || 0);
      const remaining = tr.total_length != null || tr.remnant_length != null ? baseLength - usedLength : null;
      return { ...tr, used_length: usedLength, remaining_length: remaining };
    });

    return res.status(200).json({ ok: true, data: enriched });
  }

  // ── POST /api/trommels ───────────────────────────────────────────────────────
  if (req.method === "POST") {
    const body = readJsonBody(req);
    const name          = String(body?.name || "").trim();
    const total_length  = body?.total_length != null ? Number(body.total_length) : null;
    const project_id    = String(body?.project_id || "").trim() || null;
    const cable_type    = body?.cable_type != null ? String(body.cable_type).trim() || null : null;
    const photo_url     = body?.photo_url != null ? String(body.photo_url).trim() || null : null;
    const company_name  = body?.company_name != null ? String(body.company_name).trim() || null : null;
    const serial_number = body?.serial_number != null ? String(body.serial_number).trim() || null : null;
    const diameter      = body?.diameter != null ? Number(body.diameter) : null;
    const status        = body?.status || "pending";
    const pickup_requested_at = body?.pickup_requested_at || null;
    const pickup_requested_email_sent = body?.pickup_requested_email_sent === true;
    const picked_up_at  = body?.picked_up_at || null;
    const pickup_email_sent = body?.pickup_email_sent === true;

    if (!name) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing name" } });
    }
    // Find smallest available index_number for this project
    let nextIndex = 1;
    if (project_id) {
      const { data: existingIndices } = await supabase
        .from("trommels")
        .select("index_number")
        .eq("project_id", project_id)
        .order("index_number", { ascending: true });
        
      if (existingIndices && existingIndices.length > 0) {
        const used = new Set(existingIndices.map((t: any) => t.index_number).filter((n: any) => n != null));
        while (used.has(nextIndex)) {
          nextIndex++;
        }
      }
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
      name,
      cable_type,
    };
    if (total_length !== null && Number.isFinite(total_length)) payload.total_length = total_length;
    if (project_id) {
      payload.project_id = project_id;
      payload.index_number = nextIndex;
    }
    if (photo_url)     payload.photo_url     = photo_url;
    if (company_name)  payload.company_name  = company_name;
    if (serial_number) payload.serial_number = serial_number;
    if (diameter !== null && Number.isFinite(diameter)) payload.diameter = diameter;
    if (status)        payload.status        = status;
    if (pickup_requested_at) payload.pickup_requested_at = pickup_requested_at;
    if (pickup_requested_email_sent !== undefined) payload.pickup_requested_email_sent = pickup_requested_email_sent;
    if (picked_up_at)  payload.picked_up_at  = picked_up_at;
    if (pickup_email_sent !== undefined) payload.pickup_email_sent = pickup_email_sent;
    if (body.is_archived !== undefined) payload.is_archived = body.is_archived === true;
    if (body.remnant_length !== undefined) payload.remnant_length = body.remnant_length === null || body.remnant_length === "" ? null : Number(body.remnant_length);

    const { data, error } = await supabase.from("trommels").insert(payload).select("*").single();
    if (error) {
      return res.status((error as any).status || 400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    }
    return res.status(200).json({ ok: true, data });
  }

  // ── DELETE /api/trommels?id=... (mod/admin only) ─────────────────────────────
  if (req.method === "DELETE") {
    if (!isMod) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins/mods can delete trommels" } });
    }
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!id) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing id" } });
    }
    const { error } = await supabase.from("trommels").delete().eq("id", id);
    if (error) {
      return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    }
    return res.status(200).json({ ok: true, data: { deleted: id } });
  }

  // ── PATCH /api/trommels — edit name/length/photo/company/serial (any authenticated user)
  if (req.method === "PATCH") {
    const body = readJsonBody(req);
    const id = String(body?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing id" } });

    const patch: Record<string, any> = {};
    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "name cannot be empty" } });
      patch.name = n;
    }
    if (body.total_length !== undefined) {
      patch.total_length = body.total_length === null || body.total_length === "" ? null : Number(body.total_length);
    }
    if (body.cable_type !== undefined) {
      patch.cable_type = body.cable_type === null || String(body.cable_type).trim() === "" ? null : String(body.cable_type).trim();
    }
    if (body.photo_url !== undefined) {
      patch.photo_url = body.photo_url === null || String(body.photo_url).trim() === "" ? null : String(body.photo_url).trim();
    }
    if (body.company_name !== undefined) {
      patch.company_name = body.company_name === null || String(body.company_name).trim() === "" ? null : String(body.company_name).trim();
    }
    if (body.serial_number !== undefined) {
      patch.serial_number = body.serial_number === null || String(body.serial_number).trim() === "" ? null : String(body.serial_number).trim();
    }
    if (body.diameter !== undefined) {
      patch.diameter = body.diameter === null || body.diameter === "" ? null : Number(body.diameter);
    }
    if (body.status !== undefined) {
      patch.status = body.status;
    }
    if (body.pickup_requested_at !== undefined) {
      patch.pickup_requested_at = body.pickup_requested_at;
    }
    if (body.pickup_requested_email_sent !== undefined) {
      patch.pickup_requested_email_sent = body.pickup_requested_email_sent;
    }
    if (body.picked_up_at !== undefined) {
      patch.picked_up_at = body.picked_up_at;
    }
    if (body.pickup_email_sent !== undefined) {
      patch.pickup_email_sent = body.pickup_email_sent === true;
    }
    if (body.is_archived !== undefined) patch.is_archived = body.is_archived === true;
    if (body.remnant_length !== undefined) patch.remnant_length = body.remnant_length === null || body.remnant_length === "" ? null : Number(body.remnant_length);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "No fields to update" } });
    }

    const { data, error } = await supabase.from("trommels").update(patch).eq("id", id).select("*").single();
    if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
