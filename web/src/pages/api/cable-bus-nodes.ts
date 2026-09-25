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

  const { projectId } = req.query;

  if (req.method === "GET") {
    if (!projectId) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing projectId" } });
    const { data, error } = await supabase
      .from("cable_bus_nodes")
      .select("*")
      .eq("project_id", projectId)
      .order("name", { ascending: true });

    if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "POST") {
    const body = readJsonBody(req);
    if (!body.project_id || !body.name || !body.plan_id) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing required fields" } });

    // 1. Check if it already exists for this project + plan + name
    const { data: existing } = await supabase
      .from("cable_bus_nodes")
      .select("id")
      .eq("project_id", body.project_id)
      .eq("plan_id", body.plan_id)
      .eq("name", body.name)
      .maybeSingle();

    let result;
    if (existing) {
      // 2. Update
      const { data, error } = await supabase
        .from("cable_bus_nodes")
        .update({ x: body.x, y: body.y })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
      result = data;
    } else {
      // 3. Insert
      const { data, error } = await supabase
        .from("cable_bus_nodes")
        .insert({
          project_id: body.project_id,
          name: body.name,
          plan_id: body.plan_id,
          x: body.x,
          y: body.y
        })
        .select("*")
        .single();
      if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
      result = data;
    }

    return res.status(201).json({ ok: true, data: result });
  }

  if (req.method === "PATCH") {
    const { id } = req.query;
    const body = readJsonBody(req);
    if (!id) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing id" } });

    const { data, error } = await supabase
      .from("cable_bus_nodes")
      .update(body)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "DELETE") {
    const { id, cleanup } = req.query;
    if (cleanup === "true") {
      if (!projectId) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing projectId" } });
      const { data: nodes } = await supabase.from("cable_bus_nodes").select("id").eq("project_id", projectId);
      if (!nodes) return res.status(200).json({ ok: true, data: { success: true } });
      const { data: usedA } = await supabase.from("cable_buses").select("node_a_id").eq("project_id", projectId);
      const { data: usedB } = await supabase.from("cable_buses").select("node_b_id").eq("project_id", projectId);
      const usedIds = new Set([
        ...(usedA || []).map((b: any) => b.node_a_id),
        ...(usedB || []).map((b: any) => b.node_b_id)
      ]);
      const orphans = nodes.filter((n: any) => !usedIds.has(n.id)).map((n: any) => n.id);
      if (orphans.length > 0) {
        await supabase.from("cable_bus_nodes").delete().in("id", orphans);
      }
      return res.status(200).json({ ok: true, data: { success: true, deleted: orphans.length } });
    }

    if (!id) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing id" } });
    const { error } = await supabase.from("cable_bus_nodes").delete().eq("id", id);
    if (error) return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
    return res.status(200).json({ ok: true, data: { success: true } });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
