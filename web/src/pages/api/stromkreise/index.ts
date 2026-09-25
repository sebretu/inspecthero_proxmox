import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
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

// CIRCUIT_CODE_REGEX removed to allow custom prefixes (e.g., 0F1)
const ALLOWED_TYPES = ["socket", "light", "edv", "cee", "special", "reserve", "text", "line", "arrow"];
const ALLOWED_SHAPES = ["circle", "triangle", "square", "rhombus", "hexagon", "text", "line", "arrow"];

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
  }

  let profile: any;
  try {
    profile = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const admin = getSupabaseAdminClient();


  // ------------------------
  // GET /api/stromkreise
  // ------------------------
  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId || !isUuid(projectId)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid query: projectId" } });
      return;
    }

    const planId = typeof req.query.planId === "string" ? req.query.planId.trim() : "";
    if (planId && !isUuid(planId)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid planId (uuid)" } });
      return;
    }

    let query = admin
      .from("stromkreise")
      .select("*")
      .eq("project_id", projectId);

    if (planId) {
      query = query.eq("plan_id", planId);
    }

    // Default sorting by circuit_code ascending
    query = query.order("circuit_code", { ascending: true });

    const { data, error } = await query;

    if (error) {
      res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message },
      });
      return;
    }

    const normalizedData = (data ?? []).map((m: any) => {
      if (m.metadata?.realType) {
        return { ...m, type: m.metadata.realType, marker_shape: m.metadata.realType };
      }
      return m;
    });

    res.status(200).json({ ok: true, data: normalizedData });
    return;
  }

  // ------------------------
  // POST /api/stromkreise
  // ------------------------
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const project_id = String(body?.project_id || "").trim();
    const plan_id = String(body?.plan_id || "").trim();
    const circuit_code = String(body?.circuit_code || "").trim();
    const short_label = String(body?.short_label || "").trim();
    const full_name = String(body?.full_name || "").trim();
    const type = String(body?.type || "").trim();
    const marker_shape = String(body?.marker_shape || "").trim();

    if (!project_id || !isUuid(project_id) || !plan_id || !isUuid(plan_id)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid project_id or plan_id" } });
      return;
    }

    if (!circuit_code) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid or missing circuit_code" } });
      return;
    }

    if (!short_label || !full_name) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing short_label or full_name" } });
      return;
    }

    if (!ALLOWED_TYPES.includes(type)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: `Invalid type. Allowed: ${ALLOWED_TYPES.join(", ")}` } });
      return;
    }

    if (!ALLOWED_SHAPES.includes(marker_shape)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: `Invalid marker_shape. Allowed: ${ALLOWED_SHAPES.join(", ")}` } });
      return;
    }

    const x_norm = typeof body?.x_norm === "number" ? body.x_norm : 0.5;
    const y_norm = typeof body?.y_norm === "number" ? body.y_norm : 0.5;
    const phase = asInt(body?.phase, 1);
    const breaker_current = asInt(body?.breaker_current, 16);
    const breaker_curve = String(body?.breaker_curve || "B").trim();
    const has_rcd = !!body?.has_rcd;
    const rcd_group = body?.rcd_group ? String(body.rcd_group).trim() : null;
    const rcd_current = body?.rcd_current ? asInt(body.rcd_current, 40) : null;
    const rcd_ma = body?.rcd_ma ? asInt(body.rcd_ma, 30) : null;
    const switch_group = body?.switch_group ? String(body.switch_group).trim() : null;
    const panel_group = body?.panel_group ? String(body.panel_group).trim() : null;
    const circuit_number = body?.circuit_number ? asInt(body.circuit_number, 1) : null;
    const z_index = asInt(body?.z_index, 0);
    const metadata = body?.metadata || {};

    let finalType = type;
    let finalShape = marker_shape;
    if (type === "line" || type === "arrow" || type === "text") {
      metadata.realType = type;
      finalType = type === "text" ? "special" : "socket";
    }
    if (marker_shape === "line" || marker_shape === "arrow" || marker_shape === "text") {
      metadata.realType = marker_shape;
      finalShape = "circle";
    }

    const payload = {
      project_id,
      plan_id,
      circuit_code,
      short_label,
      full_name,
      type: finalType,
      marker_shape: finalShape,
      x_norm,
      y_norm,
      phase,
      breaker_current,
      breaker_curve,
      has_rcd,
      rcd_group,
      rcd_current,
      rcd_ma,
      switch_group,
      panel_group,
      circuit_number,
      z_index,
      metadata
    };

    const { data, error } = await admin.from("stromkreise").insert(payload).select("*").single();

    if (error) {
      res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message },
      });
      return;
    }

    let returnedData = data;
    if (data && data.metadata?.realType) {
      returnedData = { ...data, type: data.metadata.realType, marker_shape: data.metadata.realType };
    }

    res.status(200).json({ ok: true, data: returnedData });
    return;
  }

  // ------------------------
  // PATCH /api/stromkreise
  // ------------------------
  if (req.method === "PATCH") {
    const body = readJsonBody(req);
    const id = String(body?.id || req.query.id || "").trim();
    if (!id || !isUuid(id)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid id (uuid)" } });
      return;
    }

    const patch: any = {};
    if (body.circuit_code !== undefined) {
      const code = String(body.circuit_code).trim();
      if (!code) {
        res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "circuit_code cannot be empty" } });
        return;
      }
      patch.circuit_code = code;
    }
    if (body.type !== undefined) {
      const t = String(body.type).trim();
      if (!ALLOWED_TYPES.includes(t)) {
        res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid type" } });
        return;
      }
      patch.type = t;
    }
    if (body.marker_shape !== undefined) {
      const s = String(body.marker_shape).trim();
      if (!ALLOWED_SHAPES.includes(s)) {
        res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid marker_shape" } });
        return;
      }
      patch.marker_shape = s;
    }
    if (body.short_label !== undefined) patch.short_label = String(body.short_label).trim();
    if (body.full_name !== undefined) patch.full_name = String(body.full_name).trim();
    if (body.x_norm !== undefined) patch.x_norm = Number(body.x_norm);
    if (body.y_norm !== undefined) patch.y_norm = Number(body.y_norm);
    if (body.phase !== undefined) patch.phase = asInt(body.phase, 1);
    if (body.breaker_current !== undefined) patch.breaker_current = asInt(body.breaker_current, 16);
    if (body.breaker_curve !== undefined) patch.breaker_curve = String(body.breaker_curve).trim();
    if (body.has_rcd !== undefined) patch.has_rcd = !!body.has_rcd;
    if (body.rcd_group !== undefined) patch.rcd_group = body.rcd_group ? String(body.rcd_group).trim() : null;
    if (body.rcd_current !== undefined) patch.rcd_current = body.rcd_current ? asInt(body.rcd_current, 40) : null;
    if (body.rcd_ma !== undefined) patch.rcd_ma = body.rcd_ma ? asInt(body.rcd_ma, 30) : null;
    if (body.switch_group !== undefined) patch.switch_group = body.switch_group ? String(body.switch_group).trim() : null;
    if (body.panel_group !== undefined) patch.panel_group = body.panel_group ? String(body.panel_group).trim() : null;
    if (body.circuit_number !== undefined) patch.circuit_number = body.circuit_number ? asInt(body.circuit_number, 1) : null;
    if (body.z_index !== undefined) patch.z_index = asInt(body.z_index, 0);
    if (body.metadata !== undefined) patch.metadata = body.metadata || {};

    if (patch.type === "line" || patch.type === "arrow" || patch.type === "text") {
      patch.metadata = patch.metadata || {};
      patch.metadata.realType = patch.type;
      patch.type = patch.type === "text" ? "special" : "socket";
    } else if (patch.type !== undefined) {
      if (patch.metadata && patch.metadata.realType) {
        delete patch.metadata.realType;
      }
    }
    if (patch.marker_shape === "line" || patch.marker_shape === "arrow" || patch.marker_shape === "text") {
      patch.metadata = patch.metadata || {};
      patch.metadata.realType = patch.marker_shape;
      patch.marker_shape = "circle";
    } else if (patch.marker_shape !== undefined) {
      if (patch.metadata && patch.metadata.realType) {
        delete patch.metadata.realType;
      }
    }

    // Fetch original marker before update to know its project_id and original circuit_code
    const { data: originalMarker, error: fetchErr } = await admin
      .from("stromkreise")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !originalMarker) {
      res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Marker not found" } });
      return;
    }

    const { data, error } = await admin.from("stromkreise").update(patch).eq("id", id).select("*").single();

    if (error) {
      res.status((error as any).status || 400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
      return;
    }

    // Synchronize all duplicate markers in the same project only if explicitly requested
    const syncAll = body.syncAllDuplicates === true || body.sync_all === true;
    const sharedPatch: any = {};
    if (patch.circuit_code !== undefined) sharedPatch.circuit_code = patch.circuit_code;
    if (patch.short_label !== undefined) sharedPatch.short_label = patch.short_label;
    if (patch.full_name !== undefined) sharedPatch.full_name = patch.full_name;
    if (patch.type !== undefined) sharedPatch.type = patch.type;
    if (patch.marker_shape !== undefined) sharedPatch.marker_shape = patch.marker_shape;
    if (patch.phase !== undefined) sharedPatch.phase = patch.phase;
    if (patch.breaker_current !== undefined) sharedPatch.breaker_current = patch.breaker_current;
    if (patch.breaker_curve !== undefined) sharedPatch.breaker_curve = patch.breaker_curve;
    if (patch.has_rcd !== undefined) sharedPatch.has_rcd = patch.has_rcd;
    if (patch.rcd_group !== undefined) sharedPatch.rcd_group = patch.rcd_group;
    if (patch.rcd_current !== undefined) sharedPatch.rcd_current = patch.rcd_current;
    if (patch.rcd_ma !== undefined) sharedPatch.rcd_ma = patch.rcd_ma;
    if (patch.switch_group !== undefined) sharedPatch.switch_group = patch.switch_group;
    if (patch.panel_group !== undefined) sharedPatch.panel_group = patch.panel_group;
    if (patch.circuit_number !== undefined) sharedPatch.circuit_number = patch.circuit_number;

    const hasSharedFields = Object.keys(sharedPatch).length > 0 || patch.metadata !== undefined;

    if (syncAll && hasSharedFields) {
      let syncQuery = admin
        .from("stromkreise")
        .select("id, metadata")
        .eq("project_id", originalMarker.project_id)
        .eq("plan_id", originalMarker.plan_id)
        .eq("circuit_code", originalMarker.circuit_code)
        .neq("id", id);

      const origPanel = (originalMarker.panel_group || "").trim();
      if (!origPanel) {
        syncQuery = syncQuery.or("panel_group.is.null,panel_group.eq.");
      } else {
        syncQuery = syncQuery.eq("panel_group", origPanel);
      }

      const { data: otherMarkers } = await syncQuery;

      if (otherMarkers && otherMarkers.length > 0) {
        const updatePromises = otherMarkers.map((m: any) => {
          const updatedPatch = { ...sharedPatch };
          if (patch.metadata !== undefined) {
            const updatedMetadata = { ...(m.metadata || {}) };
            const newMetadata = patch.metadata || {};
            Object.keys(newMetadata).forEach(key => {
              if (key !== "orientation" && key !== "rotation" && key !== "executions") {
                updatedMetadata[key] = newMetadata[key];
              }
            });
            updatedPatch.metadata = updatedMetadata;
          }
          return admin.from("stromkreise").update(updatedPatch).eq("id", m.id);
        });
        await Promise.all(updatePromises);
      }
    }

    let returnedData = data;
    if (data && data.metadata?.realType) {
      returnedData = { ...data, type: data.metadata.realType, marker_shape: data.metadata.realType };
    }

    res.status(200).json({ ok: true, data: returnedData });
    return;
  }

  if (req.method === "DELETE") {
    if (profile?.role !== "ADMIN") {
      res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Tylko administrator może usuwać markery obwodów." } });
      return;
    }

    const rawId = typeof req.query.id === "string" ? req.query.id.trim() : "";
    let id = rawId;
    if (id.startsWith("ai-pred-")) {
      id = id.replace("ai-pred-", "");
    }

    if (!id || !isUuid(id)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: `Missing or invalid id: ${rawId}` } });
      return;
    }

    // Negative Learning: Record rejection coordinate and invalidate crop before deleting
    const { data: markerToDelete } = await admin
      .from("stromkreise")
      .select("plan_id, x_norm, y_norm, symbol_type")
      .eq("id", id)
      .maybeSingle();

    if (markerToDelete && markerToDelete.plan_id) {
      try {
        await admin.from("symbol_predictions").insert({
          id: crypto.randomUUID(),
          plan_id: markerToDelete.plan_id,
          x_norm: markerToDelete.x_norm,
          y_norm: markerToDelete.y_norm,
          predicted_symbol_type: markerToDelete.symbol_type || "socket",
          confidence: 0,
          status: "rejected",
          metadata: { source: "manual_deletion_negative_learning" }
        });
      } catch {}

      try {
        await admin.from("symbol_crops")
          .update({ quality_status: "failed" })
          .eq("stromkreis_id", id);
      } catch {}

      const { error } = await admin.from("stromkreise").delete().eq("id", id);
      if (error) {
        res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
        return;
      }
      res.status(200).json({ ok: true, data: { deleted: id } });
      return;
    }

    // If not in stromkreise, check if it's a pending AI prediction in symbol_predictions
    const { data: predToDelete } = await admin
      .from("symbol_predictions")
      .select("id, plan_id, x_norm, y_norm, crop_path")
      .eq("id", id)
      .maybeSingle();

    if (predToDelete) {
      await admin
        .from("symbol_predictions")
        .update({ status: "rejected" })
        .eq("id", id);

      if (predToDelete.crop_path) {
        try {
          const { generateImageEmbeddingFromStoragePath } = await import("@/lib/embeddingService");
          const embedding = await generateImageEmbeddingFromStoragePath(predToDelete.crop_path);
          await admin.from("symbol_crops").insert({
            id: crypto.randomUUID(),
            plan_id: predToDelete.plan_id,
            x_norm: predToDelete.x_norm,
            y_norm: predToDelete.y_norm,
            image_path: predToDelete.crop_path,
            symbol_type: "rejected_negative",
            quality_status: "failed",
            embedding,
            source: "negative_learning",
            metadata: { origin: "prediction_deletion", prediction_id: id }
          });
        } catch {
          await admin.from("symbol_crops").insert({
            id: crypto.randomUUID(),
            plan_id: predToDelete.plan_id,
            x_norm: predToDelete.x_norm,
            y_norm: predToDelete.y_norm,
            image_path: predToDelete.crop_path,
            symbol_type: "rejected_negative",
            quality_status: "failed",
            source: "negative_learning",
            metadata: { origin: "prediction_deletion", prediction_id: id }
          });
        }
      }

      res.status(200).json({ ok: true, data: { deleted: id, status: "rejected" } });
      return;
    }

    const { error } = await admin.from("stromkreise").delete().eq("id", id);
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
