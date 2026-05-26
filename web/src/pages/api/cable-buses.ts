import { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

function readJsonBody(req: NextApiRequest): any {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
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
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const { projectId, id } = req.query;

  if (req.method === "GET") {
    if (!projectId) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing projectId" } });
    const { data, error } = await supabase
      .from("cable_buses")
      .select("*, node_a:node_a_id(*), node_b:node_b_id(*)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "POST") {
    const body = readJsonBody(req);
    if (!body.project_id || !body.name) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing required fields" } });

    const { data, error } = await supabase
      .from("cable_buses")
      .insert({
        project_id: body.project_id,
        name: body.name,
        spare_percent: body.spare_percent || 10,
        route_points: body.route_points,
        plan_id: body.plan_id,
        distance: body.distance,
        node_a_id: body.node_a_id,
        node_b_id: body.node_b_id,
        multi_plan_data: body.multi_plan_data
      })
      .select("*")
      .single();

    if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    return res.status(201).json({ ok: true, data });
  }

  if (req.method === "PATCH") {
    const body = readJsonBody(req);
    const busId = id || body.id;
    if (!busId) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing bus id" } });

    const update: any = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.spare_percent !== undefined) update.spare_percent = body.spare_percent;
    if (body.route_points !== undefined) update.route_points = body.route_points;
    if (body.plan_id !== undefined) update.plan_id = body.plan_id;
    if (body.distance !== undefined) update.distance = body.distance;
    if (body.node_a_id !== undefined) update.node_a_id = body.node_a_id;
    if (body.node_b_id !== undefined) update.node_b_id = body.node_b_id;
    if (body.multi_plan_data !== undefined) update.multi_plan_data = body.multi_plan_data;

    const { data, error } = await supabase
      .from("cable_buses")
      .update(update)
      .eq("id", busId)
      .select("*")
      .single();

    if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "DELETE") {
    const busId = id || req.query.id;
    if (!busId) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing id" } });

    // Get nodes before deleting
    const { data: bus } = await supabase.from("cable_buses").select("node_a_id, node_b_id").eq("id", busId).single();

    const { error } = await supabase.from("cable_buses").delete().eq("id", busId);
    if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });

    // Cleanup orphaned nodes
    if (bus) {
      const nodeIds = [bus.node_a_id, bus.node_b_id].filter(Boolean);
      for (const nodeId of nodeIds) {
        const { data: refs } = await supabase
          .from("cable_buses")
          .select("id")
          .or(`node_a_id.eq.${nodeId},node_b_id.eq.${nodeId}`)
          .limit(1);
        
        if (!refs || refs.length === 0) {
          await supabase.from("cable_bus_nodes").delete().eq("id", nodeId);
        }
      }
    }

    return res.status(200).json({ ok: true, data: { success: true } });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
