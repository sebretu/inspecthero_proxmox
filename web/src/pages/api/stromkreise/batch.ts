import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

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

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Only POST allowed" } });
    return;
  }

  let isAuthorized = false;

  // 1. Check X-Sidecar-Token
  const sidecarToken = req.headers["x-sidecar-token"];
  const expectedToken = process.env.SIDECAR_SECRET || "dev-secret-token";

  if (sidecarToken && sidecarToken === expectedToken) {
    isAuthorized = true;
  }

  // 2. Check User Session (Bearer Token)
  if (!isAuthorized) {
    try {
      const { client: supabase, userId } = createServerSupabaseClient(req);
      if (userId) {
        const profile = await requireRequesterProfile(supabase, userId);
        if (profile.role === "ADMIN") {
          isAuthorized = true;
        }
      }
    } catch (e) {
      // auth failed
    }
  }

  if (!isAuthorized) {
    res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing authorization" } });
    return;
  }

  const body = readJsonBody(req);
  const markers = body?.markers;

  if (!Array.isArray(markers) || markers.length === 0) {
    res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or empty markers array" } });
    return;
  }

  // Pre-process markers to ensure defaults
  const payload = markers.map((m: any) => ({
    project_id: m.project_id, // sidecar needs to send this, or we look it up from plan_id
    plan_id: m.plan_id,
    circuit_code: m.circuit_code || "Unknown",
    short_label: m.short_label || "AI",
    full_name: m.full_name || "AI Generated Marker",
    type: m.type || "socket",
    marker_shape: m.marker_shape || "circle",
    x_norm: m.x_norm || 0.5,
    y_norm: m.y_norm || 0.5,
    phase: m.phase || 1,
    breaker_current: m.breaker_current || 16,
    breaker_curve: m.breaker_curve || "B",
    has_rcd: !!m.has_rcd,
    rcd_group: m.rcd_group || null,
    metadata: m.metadata || {}
  }));

  // Wait, the sidecar only knows the `plan_id`. We need to fetch the `project_id` from the `plans` table first.
  const supabase = getSupabaseAdminClient();
  
  const planId = payload[0].plan_id;
  const { data: planData, error: planError } = await supabase
    .from("plans")
    .select("project_id")
    .eq("id", planId)
    .single();

  if (planError || !planData) {
    res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid plan_id or plan not found" } });
    return;
  }

  const projectId = planData.project_id;
  payload.forEach(m => m.project_id = projectId);

  const { data, error } = await supabase.from("stromkreise").insert(payload).select();

  if (error) {
    res.status(500).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message },
    });
    return;
  }

  res.status(200).json({ ok: true, data });
}
