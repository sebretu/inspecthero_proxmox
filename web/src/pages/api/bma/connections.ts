import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) return res.status(400).json({ ok: false, error: "Missing projectId" });

    const { data: connections, error: connErr } = await supabase.from("bma_connections").select("*").eq("project_id", projectId);
    const { data: routes, error: routeErr } = await supabase.from("bma_routes").select("*").eq("project_id", projectId);

    if (connErr || routeErr) return res.status(400).json({ ok: false, error: connErr?.message || routeErr?.message });
    return res.status(200).json({ ok: true, data: { connections, routes } });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (body.type === "connection") {
      const { data, error } = await supabase.from("bma_connections").insert(body.data).select("*");
      if (error) return res.status(400).json({ ok: false, error: { message: error.message } });
      return res.status(200).json({ ok: true, data: Array.isArray(body.data) ? data : data?.[0] });
    } else if (body.type === "route") {
      const { data, error } = await supabase.from("bma_routes").insert(body.data).select("*");
      if (error) return res.status(400).json({ ok: false, error: { message: error.message } });
      return res.status(200).json({ ok: true, data: Array.isArray(body.data) ? data : data?.[0] });
    }
  }

  if (req.method === "PATCH") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (body.type === "connection") {
      const { id, ...updates } = body.data;
      const { data, error } = await supabase.from("bma_connections").update(updates).eq("id", id).select("*").single();
      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, data });
    } else if (body.type === "route") {
      const { id, ...updates } = body.data;
      const { data, error } = await supabase.from("bma_routes").update(updates).eq("id", id).select("*").single();
      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, data });
    }
  }

  if (req.method === "DELETE") {
    const id = String(req.query.id || "").trim();
    const type = String(req.query.type || "").trim();
    if (type === "connection") {
      const { error } = await supabase.from("bma_connections").delete().eq("id", id);
      if (error) return res.status(400).json({ ok: false, error: error.message });
    } else if (type === "route") {
      const { error } = await supabase.from("bma_routes").delete().eq("id", id);
      if (error) return res.status(400).json({ ok: false, error: error.message });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
